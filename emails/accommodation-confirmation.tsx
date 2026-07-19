import { Heading, Text } from "@react-email/components";
import { EmailLayout, emailStyles } from "./_components/EmailLayout";
import { previewAccommodationProps } from "./_lib/preview-data";

export type AccommodationEmailProps = {
  bannerUrl: string;
  guestName: string;
  housingLabel: string;
  referenceNumber: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  totalAmount: string;
};

export default function AccommodationConfirmationEmail({
  bannerUrl,
  guestName,
  housingLabel,
  referenceNumber,
  checkIn,
  checkOut,
  guests,
  totalAmount,
}: AccommodationEmailProps) {
  return (
    <EmailLayout
      preview={`Accommodation confirmed — ${referenceNumber}`}
      bannerUrl={bannerUrl}
    >
      <Heading style={emailStyles.heading}>Accommodation confirmed</Heading>
      <Text style={emailStyles.paragraph}>Dear {guestName},</Text>
      <Text style={emailStyles.paragraph}>
        Thank you for booking campus accommodation for The Homecoming. Your
        payment has been confirmed.
      </Text>

      <Text style={emailStyles.label}>Reference</Text>
      <Text style={emailStyles.value}>{referenceNumber}</Text>

      <Text style={emailStyles.label}>Housing type</Text>
      <Text style={emailStyles.value}>{housingLabel}</Text>

      <Text style={emailStyles.label}>Check-in</Text>
      <Text style={emailStyles.value}>{checkIn}</Text>

      <Text style={emailStyles.label}>Check-out</Text>
      <Text style={emailStyles.value}>{checkOut}</Text>

      <Text style={emailStyles.label}>Guests</Text>
      <Text style={emailStyles.value}>{guests}</Text>

      <Text style={emailStyles.label}>Total paid</Text>
      <Text style={emailStyles.value}>{totalAmount}</Text>

      <Text style={emailStyles.paragraph}>
        We look forward to hosting you on campus.
      </Text>
    </EmailLayout>
  );
}

AccommodationConfirmationEmail.PreviewProps = previewAccommodationProps;
