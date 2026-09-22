import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * Centralized Order Validation & Tax Calculation
 * This ensures that both Mobile and Web apps use the same logic for:
 * 1. Price Verification
 * 2. Availability Checks
 * 3. Tax Calculations (CGST/SGST)
 * 4. Platform Fee Calculation
 */
export async function POST(req: Request) {
  try {
    const { items, cinema_id, is_pos } = await req.json();
    const supabase = await createClient();

    // Fetch global platform fee settings
    let onlineFeePercent = 1.0;
    let posFeePercent = 0.0;
    let applicableCategories = ['ALL'];
    let enableGst = true;

    try {
      const { data: feeSettingsRow } = await supabase
        .from('global_settings')
        .select('value')
        .eq('key', 'platform_fees')
        .single();

      if (feeSettingsRow && feeSettingsRow.value) {
        const val = feeSettingsRow.value as any;
        if (val.online_fee_percent !== undefined) onlineFeePercent = Number(val.online_fee_percent);
        if (val.pos_fee_percent !== undefined) posFeePercent = Number(val.pos_fee_percent);
        if (val.applicable_categories) applicableCategories = val.applicable_categories;
        if (val.enable_gst !== undefined) enableGst = Boolean(val.enable_gst);
        else if (val.enable_cgst_sgst !== undefined) enableGst = Boolean(val.enable_cgst_sgst);
      }
    } catch (dbErr) {
      console.warn('[Validation API] Could not load global platform fee settings, using defaults:', dbErr);
    }

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Invalid items format' }, { status: 400, headers: corsHeaders });
    }

    // 1. Fetch current data from DB for validation
    const foodIds = items.filter((i: any) => !i.is_combo).map((i: any) => i.id || i.food_id);
    const comboIds = items.filter((i: any) => i.is_combo).map((i: any) => i.id || i.combo_id);

    const [{ data: foodItems }, { data: comboItems }] = await Promise.all([
      supabase.from('food_items').select('*').in('id', foodIds),
      supabase.from('combos').select('*').in('id', comboIds),
    ]);

    const dbItemsMap = new Map<string, any>();
    (foodItems || []).forEach(i => dbItemsMap.set(i.id, i));
    (comboItems || []).forEach(i => dbItemsMap.set(i.id, i));

    // 1b. Fetch Addon Options from DB for accurate pricing and availability
    const addonOptionIds: string[] = [];
    for (const clientItem of items) {
      if (clientItem.addons && Array.isArray(clientItem.addons)) {
        for (const addonGroup of clientItem.addons) {
          if (!addonGroup) continue;
          if (Array.isArray(addonGroup.selectedOptions)) {
            for (const opt of addonGroup.selectedOptions) {
              if (opt?.id) addonOptionIds.push(opt.id);
            }
          } else if (Array.isArray(addonGroup.options)) {
            for (const opt of addonGroup.options) {
              if (opt?.id) addonOptionIds.push(opt.id);
            }
          } else if (addonGroup.id) {
            addonOptionIds.push(addonGroup.id);
          }
        }
      }
    }

    const dbAddonOptionsMap = new Map<string, any>();
    if (addonOptionIds.length > 0) {
      const { data: dbOptions } = await supabase
        .from('addon_options')
        .select('id, name, price, is_available')
        .in('id', addonOptionIds);
      if (dbOptions) {
        dbOptions.forEach(opt => dbAddonOptionsMap.set(opt.id, opt));
      }
    }

    // 2. Fetch active offers for this cinema outlet
    let activeOffers: any[] = [];
    if (cinema_id) {
      const { data: offers, error: offersErr } = await supabase
        .from('offers')
        .select('*, offer_items(food_item_id, custom_price)')
        .eq('cinema_id', cinema_id)
        .eq('is_active', true);
      
      if (!offersErr && offers) {
        activeOffers = offers.map(o => {
          const itemPricesMap = new Map<string, number | null>();
          o.offer_items?.forEach((oi: any) => {
            if (oi.custom_price !== undefined && oi.custom_price !== null) {
              itemPricesMap.set(oi.food_item_id, oi.custom_price);
            }
          });
          return {
            ...o,
            itemIds: new Set(o.offer_items?.map((oi: any) => oi.food_item_id) || []),
            itemPricesMap
          };
        });
      }
    }

    let grossSubtotal = 0;
    let totalDiscount = 0;
    let netTaxableSubtotal = 0;
    let netSubtotal = 0;
    const validatedItems = [];
    const errors = [];

    // 3. Validate Price, Availability & Calculate Discounts
    for (const clientItem of items) {
      const clientId = clientItem.id || (clientItem.is_combo ? clientItem.combo_id : clientItem.food_id);
      const clientName = clientItem.name || clientItem.food_name || clientItem.combo_name || 'Unknown Item';
      const dbItem = dbItemsMap.get(clientId);

      if (!dbItem) {
        errors.push(`Item not found: ${clientName}`);
        continue;
      }

      if (!dbItem.is_available) {
        errors.push(`Item unavailable: ${dbItem.name || clientName}`);
      }

      // Calculate add-on cost per unit for this item
      let addonsUnitPrice = 0;
      if (clientItem.addons && Array.isArray(clientItem.addons)) {
        for (const addonGroup of clientItem.addons) {
          if (!addonGroup) continue;
          if (Array.isArray(addonGroup.selectedOptions)) {
            for (const opt of addonGroup.selectedOptions) {
              const dbOpt = opt.id ? dbAddonOptionsMap.get(opt.id) : null;
              if (dbOpt) {
                if (dbOpt.is_available === false) {
                  errors.push(`Add-on option unavailable: ${dbOpt.name}`);
                }
                addonsUnitPrice += Number(dbOpt.price) || 0;
              } else {
                addonsUnitPrice += Number(opt.price) || 0;
              }
            }
          } else if (Array.isArray(addonGroup.options)) {
            for (const opt of addonGroup.options) {
              const dbOpt = opt.id ? dbAddonOptionsMap.get(opt.id) : null;
              if (dbOpt) {
                if (dbOpt.is_available === false) {
                  errors.push(`Add-on option unavailable: ${dbOpt.name}`);
                }
                addonsUnitPrice += Number(dbOpt.price) || 0;
              } else {
                addonsUnitPrice += Number(opt.price) || 0;
              }
            }
          } else if (addonGroup.price !== undefined) {
            const dbOpt = addonGroup.id ? dbAddonOptionsMap.get(addonGroup.id) : null;
            if (dbOpt) {
              addonsUnitPrice += Number(dbOpt.price) || 0;
            } else {
              addonsUnitPrice += Number(addonGroup.price) || 0;
            }
          } else if (addonGroup.extraPrice !== undefined) {
            addonsUnitPrice += Number(addonGroup.extraPrice) || 0;
          }
        }
      }

      let basePrice = dbItem.price;

      // PRE-PROCESSING: If this item was explicitly added under an UNLIMITED offer, override its base price.
      if (clientItem.offer_id) {
        const selectedOffer = activeOffers.find(o => o.id === clientItem.offer_id);
        if (selectedOffer && selectedOffer.category === 'UNLIMITED') {
          const customPrice = selectedOffer.itemPricesMap?.get(clientId);
          const promoPrice = (customPrice !== undefined && customPrice !== null) ? customPrice : selectedOffer.promo_price;
          if (promoPrice !== undefined && promoPrice !== null) {
            basePrice = promoPrice;
          }
        }
      }

      const unitPrice = basePrice + addonsUnitPrice;
      const quantity = clientItem.quantity;
      const itemGrossTotal = unitPrice * quantity;
      grossSubtotal += itemGrossTotal;

      // Scan and calculate the best applicable offer for this product
      let bestDiscount = 0;
      let appliedOffer = null;

      const matchingOffers = activeOffers.filter(o => o.itemIds.has(clientId));
      for (const offer of matchingOffers) {
        let currentDiscount = 0;

        switch (offer.category) {
          case 'BUY_1_GET_1': {
            const block = 2; // Buy 1 Get 1 = group of 2
            const freeCount = Math.floor(quantity / block) * 1;
            currentDiscount = freeCount * basePrice;
            break;
          }
          case 'BUY_1_GET_2': {
            const block = 3; // Buy 1 Get 2 = group of 3
            const freeCount = Math.floor(quantity / block) * 2;
            currentDiscount = freeCount * basePrice;
            break;
          }
          case 'BUY_2_GET_1': {
            const block = 3; // Buy 2 Get 1 = group of 3
            const freeCount = Math.floor(quantity / block) * 1;
            currentDiscount = freeCount * basePrice;
            break;
          }
          case 'UNLIMITED': {
            // Price is already overridden in the pre-processing step above.
            // No additional discount is applied.
            break;
          }
          case 'FLAT_DISCOUNT': {
            if (offer.flat_discount_amount) {
              currentDiscount = Math.min(offer.flat_discount_amount, itemGrossTotal);
            }
            break;
          }
          case 'OFFER_OF_THE_DAY':
          case 'OFFER_OF_THE_WEEK':
          case 'OFFER_OF_THE_FESTIVAL':
          case 'OFFER_OF_THE_FILM': {
            // Can be configured as a percentage discount, a custom promo price, or a flat discount
            const customPrice = offer.itemPricesMap?.get(clientId);
            const promoPrice = (customPrice !== undefined && customPrice !== null) ? customPrice : offer.promo_price;

            if (offer.discount_percentage) {
              currentDiscount = itemGrossTotal * (offer.discount_percentage / 100);
            } else if (promoPrice !== null && promoPrice !== undefined) {
              currentDiscount = Math.max(0, basePrice - promoPrice) * quantity;
            } else if (offer.flat_discount_amount) {
              currentDiscount = Math.min(offer.flat_discount_amount, itemGrossTotal);
            }
            break;
          }
          default:
            break;
        }

        if (currentDiscount > bestDiscount) {
          bestDiscount = currentDiscount;
          appliedOffer = {
            id: offer.id,
            category: offer.category,
            title: offer.title,
            discount: Math.round(currentDiscount * 100) / 100
          };
        }
      }

      totalDiscount += bestDiscount;
      const itemNetTotal = itemGrossTotal - bestDiscount;
      netSubtotal += itemNetTotal;

      if (dbItem.apply_gst !== false) {
        netTaxableSubtotal += itemNetTotal;
      }

      validatedItems.push({
        ...clientItem,
        food_price: unitPrice, // Enforce server-side price including addons
        base_price: basePrice,
        addons_price: addonsUnitPrice,
        total: itemGrossTotal,
        net_total: itemNetTotal,
        discount: bestDiscount,
        applied_offer: appliedOffer
      });
    }

    if (errors.length > 0) {
      return NextResponse.json({ success: false, errors }, { status: 422, headers: corsHeaders });
    }

    // 4. Centralized Tax Calculations on Net Subtotal
    const cgst = enableGst ? Math.round(netTaxableSubtotal * 0.025 * 100) / 100 : 0;
    const sgst = enableGst ? Math.round(netTaxableSubtotal * 0.025 * 100) / 100 : 0;

    const isPOS = is_pos === true;
    const feePercent = isPOS ? posFeePercent : onlineFeePercent;

    let feeTaxableSubtotal = 0;
    for (const item of validatedItems) {
      const isCombo = item.is_combo === true;
      const category = (item.food_category || item.category || '').toUpperCase();
      if (applicableCategories.includes('ALL') || (!isCombo && applicableCategories.includes(category))) {
        feeTaxableSubtotal += item.net_total;
      }
    }

    const platformFee = Math.round(feeTaxableSubtotal * (feePercent / 100) * 100) / 100;
    const total = netSubtotal + cgst + sgst + platformFee;

    return NextResponse.json({
      success: true,
      breakdown: {
        subtotal: Math.round(grossSubtotal * 100) / 100,
        discount: Math.round(totalDiscount * 100) / 100,
        cgst,
        sgst,
        platform_charges: platformFee,
        platform_fee_percent: feePercent,
        total: Math.round(total * 100) / 100,
      },
      items: validatedItems,
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('[Validation API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
}
