const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) process.env[parts[0].trim()] = parts.slice(1).join('=').trim();
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pwbvoosqunrvqewokynz.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function syncAllOutlets() {
  console.log("=== SYNCING ALL OUTLETS MENU AND ADDONS ===");

  // 1. Ensure all food_items and combos have cinema_id = NULL (global for all outlets)
  console.log("\n1. Making all food_items & combos global (cinema_id = NULL)...");
  const { data: updatedFoods, error: foodErr } = await supabase
    .from('food_items')
    .update({ cinema_id: null })
    .not('cinema_id', 'is', null)
    .select('id');
  if (foodErr) console.error("Food items update error:", foodErr);
  else console.log(`Updated ${updatedFoods?.length || 0} non-null food items to NULL.`);

  const { data: updatedCombos, error: comboErr } = await supabase
    .from('combos')
    .update({ cinema_id: null })
    .not('cinema_id', 'is', null)
    .select('id');
  if (comboErr) console.error("Combos update error:", comboErr);
  else console.log(`Updated ${updatedCombos?.length || 0} non-null combos to NULL.`);

  // 2. Fetch all cinemas
  const { data: cinemas, error: cinemaErr } = await supabase.from('cinemas').select('id, name');
  if (cinemaErr || !cinemas) {
    console.error("Failed to fetch cinemas:", cinemaErr);
    return;
  }
  console.log(`\nFound ${cinemas.length} cinemas:`, cinemas.map(c => `${c.name} (${c.id})`));

  // 3. Find source cinema (Rathindra Multiplex has 11 groups)
  const sourceCinemaId = '647b4c19-096f-477a-bdb5-d2d8f04a0a1f';
  console.log(`\nSource cinema for add-ons: Rathindra Multiplex (${sourceCinemaId})`);

  // Fetch source groups, options, and assignments
  const { data: srcGroups, error: srcGErr } = await supabase
    .from('addon_groups')
    .select('*')
    .eq('cinema_id', sourceCinemaId)
    .order('sort_order', { ascending: true });

  if (srcGErr || !srcGroups || srcGroups.length === 0) {
    console.error("Failed to fetch source addon groups:", srcGErr);
    return;
  }
  console.log(`Source has ${srcGroups.length} addon groups.`);

  const srcGroupIds = srcGroups.map(g => g.id);

  const { data: srcOptions, error: srcOErr } = await supabase
    .from('addon_options')
    .select('*')
    .in('group_id', srcGroupIds)
    .order('sort_order', { ascending: true });

  if (srcOErr) {
    console.error("Failed to fetch source addon options:", srcOErr);
    return;
  }
  console.log(`Source has ${srcOptions?.length || 0} addon options.`);

  const { data: srcAssignments, error: srcAErr } = await supabase
    .from('addon_group_assignments')
    .select('*')
    .eq('cinema_id', sourceCinemaId);

  if (srcAErr) {
    console.error("Failed to fetch source assignments:", srcAErr);
    return;
  }
  console.log(`Source has ${srcAssignments?.length || 0} group assignments.`);

  // 4. Sync to all target cinemas
  for (const cinema of cinemas) {
    if (cinema.id === sourceCinemaId) {
      console.log(`\nSkipping source cinema: ${cinema.name}`);
      continue;
    }

    console.log(`\n--- Syncing for ${cinema.name} (${cinema.id}) ---`);

    // A. Delete existing assignments for this cinema
    const { error: delAssignErr } = await supabase
      .from('addon_group_assignments')
      .delete()
      .eq('cinema_id', cinema.id);
    if (delAssignErr) console.warn("Delete assignments error:", delAssignErr.message);

    // B. Delete existing groups for this cinema (options cascade delete)
    const { error: delGroupsErr } = await supabase
      .from('addon_groups')
      .delete()
      .eq('cinema_id', cinema.id);
    if (delGroupsErr) console.warn("Delete groups error:", delGroupsErr.message);

    // Map old groupId -> new groupId
    const groupIdMap = {};

    // C. Recreate addon groups
    for (const srcG of srcGroups) {
      const { data: newG, error: insGErr } = await supabase
        .from('addon_groups')
        .insert({
          cinema_id: cinema.id,
          name: srcG.name,
          display_name: srcG.display_name,
          selection_type: srcG.selection_type,
          is_required: srcG.is_required,
          min_selection: srcG.min_selection,
          max_selection: srcG.max_selection,
          sort_order: srcG.sort_order
        })
        .select()
        .single();

      if (insGErr) {
        console.error(`Failed to insert group ${srcG.name} for ${cinema.name}:`, insGErr.message);
        continue;
      }
      groupIdMap[srcG.id] = newG.id;

      // D. Insert options for this group
      const matchingOptions = (srcOptions || []).filter(o => o.group_id === srcG.id);
      if (matchingOptions.length > 0) {
        const optionsPayload = matchingOptions.map(o => ({
          group_id: newG.id,
          name: o.name,
          price: o.price,
          is_available: o.is_available,
          sort_order: o.sort_order
        }));

        const { error: insOErr } = await supabase.from('addon_options').insert(optionsPayload);
        if (insOErr) console.error(`Failed to insert options for group ${newG.name}:`, insOErr.message);
      }
    }

    // E. Recreate assignments
    const assignmentsPayload = [];
    for (const srcA of srcAssignments || []) {
      const newGId = groupIdMap[srcA.group_id];
      if (newGId) {
        assignmentsPayload.push({
          group_id: newGId,
          cinema_id: cinema.id,
          food_item_id: srcA.food_item_id,
          category: srcA.category
        });
      }
    }

    if (assignmentsPayload.length > 0) {
      const { error: insAErr } = await supabase
        .from('addon_group_assignments')
        .insert(assignmentsPayload);
      if (insAErr) console.error(`Failed to insert assignments for ${cinema.name}:`, insAErr.message);
      else console.log(`Created ${assignmentsPayload.length} assignments for ${cinema.name}.`);
    }
  }

  // 5. Verification
  console.log("\n=== VERIFICATION ===");
  for (const cinema of cinemas) {
    const { data: gList } = await supabase.from('addon_groups').select('id, name, addon_options(*)').eq('cinema_id', cinema.id);
    const { data: aList } = await supabase.from('addon_group_assignments').select('id').eq('cinema_id', cinema.id);
    const totalOptions = gList?.reduce((acc, g) => acc + (g.addon_options?.length || 0), 0) || 0;
    console.log(`Cinema: ${cinema.name.padEnd(22)} | Groups: ${gList?.length || 0} | Options: ${totalOptions} | Assignments: ${aList?.length || 0}`);
  }

  console.log("\nSync complete! All outlets now have the exact same menu and add-ons.");
}

syncAllOutlets();
