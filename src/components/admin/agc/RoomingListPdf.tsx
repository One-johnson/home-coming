"use client";

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";

import { roomingListModel, type RoomingListDoc, type RoomingListModel } from "@/lib/agcRoomingList";

/**
 * Printable rooming list, downloaded as a PDF rather than printed from the
 * console: window.print() inside the Rooms dialog printed the surrounding
 * screen and clipped the dialog's scroll box to a page.
 *
 * This module is imported lazily from `RoomsTab` so the PDF renderer stays out
 * of the admin bundle until someone actually downloads a list.
 */

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 44,
    paddingHorizontal: 30,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#111827",
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: "#111827",
    paddingBottom: 6,
    marginBottom: 4,
  },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  muted: { fontSize: 8, color: "#4b5563" },
  totals: { flexDirection: "row", marginTop: 6 },
  total: { fontSize: 8, marginRight: 14 },
  bold: { fontFamily: "Helvetica-Bold" },
  group: { marginTop: 14 },
  groupHeading: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.7,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
  },
  room: { marginTop: 9 },
  roomName: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  roomMeta: { fontSize: 8, color: "#4b5563", marginBottom: 2 },
  headRow: {
    flexDirection: "row",
    paddingBottom: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: "#9ca3af",
  },
  headCell: { fontSize: 7, color: "#6b7280" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2.5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
  },
  bed: { width: 22, textAlign: "center", color: "#6b7280" },
  guest: { flexGrow: 1, flexBasis: 0, paddingRight: 6 },
  hub: { width: 108, paddingRight: 6 },
  ref: { width: 78, fontFamily: "Courier" },
  tick: { width: 40 },
  vacantText: { flexGrow: 1, flexBasis: 0, fontFamily: "Helvetica-Oblique", color: "#6b7280" },
  empty: { marginTop: 26, fontSize: 10, color: "#4b5563" },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 30,
    right: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: "#e5e7eb",
    paddingTop: 4,
    fontSize: 7,
    color: "#6b7280",
  },
});

function RoomBlock({ room }: { room: RoomingListModel["groups"][number]["rooms"][number] }) {
  return (
    // wrap={false} keeps a room on one page, the PDF equivalent of break-inside: avoid.
    <View style={styles.room} wrap={false}>
      <Text style={styles.roomName}>{room.name}</Text>
      <Text style={styles.roomMeta}>{room.heading}</Text>
      <View style={styles.headRow}>
        <Text style={[styles.headCell, styles.bed]}>Bed</Text>
        <Text style={[styles.headCell, styles.guest]}>Guest</Text>
        <Text style={[styles.headCell, styles.hub]}>Hub</Text>
        <Text style={[styles.headCell, styles.ref]}>Booking ref</Text>
        <Text style={[styles.headCell, styles.tick]}>Arrived</Text>
      </View>
      {room.beds.map((bed) => (
        <View key={`${room.id}-${bed.bed}`} style={styles.row}>
          <Text style={styles.bed}>{bed.bed}</Text>
          {bed.kind === "guest" ? (
            <>
              <Text style={styles.guest}>{bed.name}</Text>
              <Text style={styles.hub}>{bed.hubName || "—"}</Text>
              <Text style={styles.ref}>{bed.bookingRef || "—"}</Text>
            </>
          ) : (
            <>
              <Text style={styles.vacantText}>(vacant)</Text>
              <Text style={styles.hub} />
              <Text style={styles.ref} />
            </>
          )}
          <Text style={styles.tick} />
        </View>
      ))}
    </View>
  );
}

export function RoomingListDocument({ model }: { model: RoomingListModel }) {
  return (
    <Document
      title={`Rooming list — ${model.filterLabel}`}
      author={model.generatedBy ?? "Accommodation console"}
      subject="Accommodation rooming list"
      creator="Attempt Great Things Conference 2026"
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.title}>Rooming list — Attempt Great Things Conference 2026</Text>
          <Text style={styles.muted}>
            Accommodation: {model.filterLabel}
            {" · Generated "}
            {model.generatedLabel}
            {model.generatedBy ? ` · by ${model.generatedBy}` : ""}
          </Text>
          <View style={styles.totals}>
            <Text style={styles.total}>
              <Text style={styles.bold}>{model.totals.rooms}</Text> room(s)
            </Text>
            <Text style={styles.total}>
              <Text style={styles.bold}>{model.totals.beds}</Text> bed(s)
            </Text>
            <Text style={styles.total}>
              <Text style={styles.bold}>{model.totals.filled}</Text> filled
            </Text>
            <Text style={styles.total}>
              <Text style={styles.bold}>{model.totals.vacant}</Text> vacant
            </Text>
          </View>
        </View>

        {model.isEmpty ? (
          <Text style={styles.empty}>No rooms match this filter.</Text>
        ) : (
          model.groups.map((group) => (
            <View key={group.label} style={styles.group}>
              <Text style={styles.groupHeading}>
                {group.label.toUpperCase()} — {group.rooms.length} room(s)
              </Text>
              {group.rooms.map((room) => (
                <RoomBlock key={room.id} room={room} />
              ))}
            </View>
          ))
        )}

        <View fixed style={styles.footer}>
          <Text>
            Tick “Arrived” as each delegate collects their key. Vacant beds are listed so the
            count reconciles.
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/**
 * Build the PDF in the browser and hand it to the user as a download. Returns
 * the file name so the caller can confirm what was saved.
 */
export async function downloadRoomingListPdf(doc: RoomingListDoc): Promise<string> {
  const model = roomingListModel(doc);
  const blob = await pdf(<RoomingListDocument model={model} />).toBlob();
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = model.fileName;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Safari needs the URL to outlive the click; never revoke synchronously.
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  return model.fileName;
}
