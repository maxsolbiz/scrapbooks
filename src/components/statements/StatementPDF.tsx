import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 10, fontFamily: "Helvetica" },
  header: { fontSize: 18, marginBottom: 20, textAlign: "center", fontWeight: "bold" },
  subtitle: { fontSize: 12, marginBottom: 10, color: "#666" },
  section: { marginBottom: 15, borderBottomWidth: 1, borderBottomColor: "#DDD", paddingBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: "bold", marginBottom: 10, borderBottomWidth: 2, borderBottomColor: "#333", paddingBottom: 5 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#CCC", paddingVertical: 4 },
  colHeader: { flex: 1, fontWeight: "bold", fontSize: 9, paddingRight: 4 },
  col: { flex: 1, fontSize: 9, paddingRight: 4 },
  colRight: { flex: 1, textAlign: "right", fontSize: 9 },
  totalRow: { flexDirection: "row", borderTopWidth: 2, borderTopColor: "#333", paddingTop: 6, marginTop: 6 },
  totalLabel: { flex: 2, fontWeight: "bold", fontSize: 10 },
  totalValue: { flex: 1, textAlign: "right", fontWeight: "bold", fontSize: 10 },
  agingGrid: { flexDirection: "row", gap: 10, marginBottom: 15 },
  agingBox: { flex: 1, backgroundColor: "#F5F5F5", padding: 8, borderRadius: 4 },
  agingTitle: { fontSize: 11, fontWeight: "bold", marginBottom: 5, color: "#333" },
  agingValue: { fontSize: 16, fontWeight: "bold", color: "#1A73E8" },
  agingLabel: { fontSize: 8, color: "#666" },
});

interface StatementPDFProps {
  statement: {
    party: { id: string; code: string; nameEn: string; nameAr: string; type: string };
    summary: { totalInvoiced: bigint; totalPaid: bigint; outstanding: bigint; availableCredit: bigint };
    aging: { current: bigint; days31to60: bigint; days61to90: bigint; over90: bigint; total: bigint };
    transactions: Array<{ date: Date; type: string; documentNo: string; amount: bigint; allocated: bigint; outstanding: bigint; status: string }>;
  };
}

// Register a basic font (Helvetica works on most systems with react-pdf)
Font.register({
  family: "Helvetica",
  fonts: [
    { src: "https://fonts.gstatic.com/s/helvetica/v11/HEL1.ttf", fontWeight: "normal" },
    { src: "https://fonts.gstatic.com/s/helvetica/v11/HEL1.ttf", fontWeight: "bold" },
  ],
});

export const StatementPDF = ({ statement }: StatementPDFProps) => {
  const fmt = (n: bigint) => (Number(n) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>Customer Statement</Text>
        <Text style={styles.subtitle}>
          {statement.party.nameEn} ({statement.party.code}) · {statement.party.type}
        </Text>

        {/* Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={styles.row}>
            <Text style={styles.col}>Total Invoiced</Text>
            <Text style={styles.colRight}>{fmt(statement.summary.totalInvoiced)} AED</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.col}>Total Paid</Text>
            <Text style={styles.colRight}>{fmt(statement.summary.totalPaid)} AED</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.col}>Outstanding Balance</Text>
            <Text style={{ ...styles.colRight, color: statement.summary.outstanding > 0n ? "#D32F2F" : "#333" }}>
              {fmt(statement.summary.outstanding)} AED
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.col}>Available Credit</Text>
            <Text style={{ ...styles.colRight, color: statement.summary.availableCredit > 0n ? "#2E7D32" : "#333" }}>
              {fmt(statement.summary.availableCredit)} AED
            </Text>
          </View>
        </View>

        {/* Aging */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Aging Analysis</Text>
          <View style={styles.agingGrid}>
            <View style={styles.agingBox}>
              <Text style={styles.agingTitle}>Current (0-30 days)</Text>
              <Text style={styles.agingValue}>{fmt(statement.aging.current)} AED</Text>
              <Text style={styles.agingLabel}>Not past due date</Text>
            </View>
            <View style={styles.agingBox}>
              <Text style={styles.agingTitle}>31-60 Days</Text>
              <Text style={styles.agingValue}>{fmt(statement.aging.days31to60)} AED</Text>
              <Text style={styles.agingLabel}>Slightly overdue</Text>
            </View>
            <View style={styles.agingBox}>
              <Text style={styles.agingTitle}>61-90 Days</Text>
              <Text style={styles.agingValue}>{fmt(statement.aging.days61to90)} AED</Text>
              <Text style={styles.agingLabel}>Moderately overdue</Text>
            </View>
            <View style={styles.agingBox}>
              <Text style={styles.agingTitle}>90+ Days</Text>
<Text style={{ ...styles.agingValue, color: statement.aging.over90 > 0n ? "#D32F2F" : "#333" }}>
                  {fmt(statement.aging.over90)} AED
                </Text>
              <Text style={styles.agingLabel}>Significantly overdue</Text>
            </View>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Outstanding (Aging)</Text>
            <Text style={styles.totalValue}>{fmt(statement.aging.total)} AED</Text>
          </View>
        </View>

        {/* Transaction History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transaction History</Text>
          <View style={[styles.row, { backgroundColor: "#F5F5F5" }]}>
            <Text style={[styles.colHeader, { flex: 0.8 }]}>Date</Text>
            <Text style={[styles.colHeader, { flex: 1.2 }]}>Type</Text>
            <Text style={[styles.colHeader, { flex: 1.5 }]}>Document No.</Text>
            <Text style={[styles.colHeader, { flex: 1 }]}>Amount</Text>
            <Text style={[styles.colHeader, { flex: 0.8 }]}>Status</Text>
          </View>
          {statement.transactions.map((tx: any, i: number) => (
            <View key={i} style={styles.row}>
              <Text style={{ flex: 0.8, fontSize: 8 }}>{new Date(tx.date).toISOString().slice(0, 10)}</Text>
              <Text style={{ flex: 1.2, fontSize: 8 }}>{tx.type}</Text>
              <Text style={{ flex: 1.5, fontSize: 7 }}>{tx.documentNo}</Text>
              <Text style={{ flex: 1, textAlign: "right", fontSize: 8 }}>
                {tx.type === "invoice" ? fmt(tx.amount) : tx.type === "payment" ? fmt(tx.amount) : "—"}
              </Text>
              <Text style={{ flex: 0.8, fontSize: 8 }}>{tx.status}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
};