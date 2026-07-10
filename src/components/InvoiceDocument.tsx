import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Font } from '@react-pdf/renderer';
import path from 'path';

// Define styles
const styles = StyleSheet.create({
  page: {
    padding: 40,
    backgroundColor: '#ffffff',
    fontFamily: 'Helvetica',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  logoContainer: {
    width: '50%',
  },
  logoPlaceholder: {
    fontSize: 24,
    color: '#ff69b4',
    fontWeight: 'bold',
  },
  logoSubText: {
    fontSize: 10,
    color: '#ffb6c1',
    fontStyle: 'italic',
  },
  invoiceTitleContainer: {
    alignItems: 'flex-start',
    marginTop: 20,
  },
  invoiceTitle: {
    fontSize: 20,
    color: '#d35400',
    fontWeight: 'bold',
  },
  invoiceMetaContainer: {
    alignItems: 'flex-end',
    width: '100%',
  },
  invoiceNumber: {
    fontSize: 12,
    color: '#555555',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  invoiceDate: {
    fontSize: 10,
    color: '#777777',
  },
  divider: {
    borderBottomWidth: 2,
    borderBottomColor: '#d35400',
    marginBottom: 15,
    marginTop: 10,
  },
  customerBox: {
    backgroundColor: '#fdf5e6',
    padding: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#d35400',
    marginBottom: 20,
  },
  customerTextRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  customerLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#333333',
    width: 100,
  },
  customerValue: {
    fontSize: 11,
    color: '#333333',
  },
  table: {
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderBottomWidth: 0,
    borderRightWidth: 0,
    marginBottom: 20,
  },
  tableRow: {
    margin: 'auto',
    flexDirection: 'row',
  },
  tableColHeader: {
    borderStyle: 'solid',
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#f9f9f9',
    padding: 8,
  },
  tableCol: {
    borderStyle: 'solid',
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderColor: '#e0e0e0',
    padding: 8,
  },
  colItem: { width: '40%' },
  colQty: { width: '15%', textAlign: 'center' },
  colPrice: { width: '22.5%', textAlign: 'right' },
  colTotal: { width: '22.5%', textAlign: 'right' },
  tableCellHeader: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  tableCell: {
    fontSize: 10,
    color: '#34495e',
  },
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: '#fdf5e6',
    borderBottomWidth: 1,
    borderColor: '#e0e0e0',
  },
  summaryLabelCol: {
    width: '77.5%',
    borderRightWidth: 1,
    borderColor: '#e0e0e0',
    padding: 8,
    alignItems: 'flex-end',
  },
  summaryValueCol: {
    width: '22.5%',
    borderRightWidth: 1,
    borderColor: '#e0e0e0',
    padding: 8,
    alignItems: 'flex-end',
  },
  summaryLabelText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#d35400',
  },
  summaryValueText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#d35400',
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
    textAlign: 'center',
  },
  footerText: {
    fontSize: 9,
    color: '#7f8c8d',
    marginBottom: 5,
  },
  footerTextBold: {
    fontSize: 9,
    color: '#d35400',
    fontWeight: 'bold',
    marginBottom: 5,
  },
  footerDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
    marginVertical: 10,
  },
  companyName: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#555555',
    marginBottom: 4,
  },
});

export default function InvoiceDocument({ order, items, customer }: { order: any, items: any[], customer?: any }) {
  // Format dates and currency
  const dateStr = order.timestamp 
    ? new Date(order.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    
  // Using Rs. instead of ₹ to prevent font encoding issues like '¹'
  const formatCurrency = (amount: number) => `Rs. ${Number(amount).toFixed(2)}`;

  const customerName = customer ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() : (order.customer_phone || 'Walk-in Customer');
  const customerEmail = customer?.email || '';

  // Calculate Subtotal and Grand Total
  const grandTotal = order.total_amount || 0;
  
  let subtotal = 0;
  if (items && items.length > 0) {
    subtotal = items.reduce((sum, item) => sum + ((item.food_price || item.price || 0) * (item.quantity || 1)), 0);
  } else {
    subtotal = grandTotal;
  }

  // Calculate taxes
  const cgst = subtotal * 0.025;
  const sgst = subtotal * 0.025;
  
  // Determine if it's an Outlet Order (Outlet orders hide platform fees)
  const isOutlet = order.location && order.location.toUpperCase().includes('OUTLET');

  // Calculate remaining platform charges/fees to make the math add up perfectly to grandTotal
  let platformCharges = grandTotal - subtotal - cgst - sgst;
  if (platformCharges < 0) platformCharges = 0; // Prevent negative platform charges if subtotal equals grandTotal

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* Header with Logo and Invoice Title */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            {/* Logo image from public folder */}
            <Image src={path.join(process.cwd(), 'public', 'logo.jpg')} style={{ width: 120, marginBottom: 10 }} />
            
            <View style={styles.invoiceTitleContainer}>
              <Text style={styles.invoiceTitle}>Invoice</Text>
            </View>
          </View>

          <View style={styles.invoiceMetaContainer}>
            <Text style={styles.invoiceNumber}>Invoice #{order.display_id || order.id?.substring(0,8)}</Text>
            <Text style={styles.invoiceDate}>{dateStr}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Customer Info Box */}
        <View style={styles.customerBox}>
          <View style={styles.customerTextRow}>
            <Text style={styles.customerLabel}>Customer Name:</Text>
            <Text style={styles.customerValue}>{customerName}</Text>
          </View>
          {customerEmail ? (
            <View style={styles.customerTextRow}>
              <Text style={styles.customerLabel}>Email:</Text>
              <Text style={styles.customerValue}>{customerEmail}</Text>
            </View>
          ) : null}
          {order.location && (
            <View style={styles.customerTextRow}>
              <Text style={styles.customerLabel}>Location:</Text>
              <Text style={styles.customerValue}>{order.location}</Text>
            </View>
          )}
        </View>

        {/* Items Table */}
        <View style={styles.table}>
          {/* Table Header */}
          <View style={styles.tableRow}>
            <View style={[styles.tableColHeader, styles.colItem]}>
              <Text style={styles.tableCellHeader}>Item</Text>
            </View>
            <View style={[styles.tableColHeader, styles.colQty]}>
              <Text style={styles.tableCellHeader}>Qty</Text>
            </View>
            <View style={[styles.tableColHeader, styles.colPrice]}>
              <Text style={styles.tableCellHeader}>Price</Text>
            </View>
            <View style={[styles.tableColHeader, styles.colTotal]}>
              <Text style={styles.tableCellHeader}>Total</Text>
            </View>
          </View>

          {/* Table Rows */}
          {items && items.map((item, index) => {
            const qty = item.quantity || 1;
            const price = item.food_price || item.price || 0;
            const total = item.net_total || item.total || (price * qty);

            return (
              <View style={styles.tableRow} key={index}>
                <View style={[styles.tableCol, styles.colItem]}>
                  <Text style={styles.tableCell}>{item.name}</Text>
                </View>
                <View style={[styles.tableCol, styles.colQty]}>
                  <Text style={styles.tableCell}>{qty}</Text>
                </View>
                <View style={[styles.tableCol, styles.colPrice]}>
                  <Text style={styles.tableCell}>{formatCurrency(price)}</Text>
                </View>
                <View style={[styles.tableCol, styles.colTotal]}>
                  <Text style={styles.tableCell}>{formatCurrency(total)}</Text>
                </View>
              </View>
            );
          })}

          {/* Subtotal Row */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryLabelCol}>
              <Text style={styles.summaryLabelText}>Subtotal</Text>
            </View>
            <View style={styles.summaryValueCol}>
              <Text style={styles.summaryValueText}>{formatCurrency(subtotal)}</Text>
            </View>
          </View>
          
          {/* CGST Row */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryLabelCol}>
              <Text style={{ fontSize: 10, color: '#555' }}>CGST (2.5%)</Text>
            </View>
            <View style={styles.summaryValueCol}>
              <Text style={{ fontSize: 10, color: '#555' }}>{formatCurrency(cgst)}</Text>
            </View>
          </View>

          {/* SGST Row */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryLabelCol}>
              <Text style={{ fontSize: 10, color: '#555' }}>SGST (2.5%)</Text>
            </View>
            <View style={styles.summaryValueCol}>
              <Text style={{ fontSize: 10, color: '#555' }}>{formatCurrency(sgst)}</Text>
            </View>
          </View>

          {/* Platform Charges Row */}
          {!isOutlet && platformCharges > 0.01 && (
            <View style={styles.summaryRow}>
              <View style={styles.summaryLabelCol}>
                <Text style={{ fontSize: 10, color: '#555' }}>Platform Charges</Text>
              </View>
              <View style={styles.summaryValueCol}>
                <Text style={{ fontSize: 10, color: '#555' }}>{formatCurrency(platformCharges)}</Text>
              </View>
            </View>
          )}

          {/* Grand Total Row */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryLabelCol}>
              <Text style={styles.summaryLabelText}>Grand Total</Text>
            </View>
            <View style={styles.summaryValueCol}>
              <Text style={styles.summaryValueText}>{formatCurrency(grandTotal)}</Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Thank you for dining at <Text style={{fontWeight: 'bold', color: '#555'}}>Love</Text> ☕</Text>
          <Text style={styles.footerText}>Need help? <Text style={styles.footerTextBold}>support@lovecafe.org.in</Text></Text>
          <Text style={styles.footerText}>© {new Date().getFullYear()} Love. All rights reserved.</Text>
          
          <View style={styles.footerDivider} />
          
          <Text style={styles.companyName}>LOVE</Text>
          <Text style={styles.footerText}>534/4/E,West Panshila,Kolkata-700112</Text>
          <Text style={styles.footerText}>GST No : 19CZFPS4424J1ZX</Text>
          <Text style={styles.footerText}>FSSAI No : 22824131000626</Text>
        </View>

      </Page>
    </Document>
  );
}
