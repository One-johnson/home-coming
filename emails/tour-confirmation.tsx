import { Heading, Text } from "@react-email/components";
import { EmailLayout, emailStyles } from "./_components/EmailLayout";
import { previewTourProps } from "./_lib/preview-data";

export type TourEmailProps = {
  bannerUrl: string;
  fullName: string;
  referenceNumber: string;
  itemLines: string[];
  totalAmount: string;
};

export default function TourConfirmationEmail({
  bannerUrl,
  fullName,
  referenceNumber,
  itemLines,
  totalAmount,
}: TourEmailProps) {
  return (
    <EmailLayout
      preview={`Tour booking confirmed — ${referenceNumber}`}
      bannerUrl={bannerUrl}
    >
      <Heading style={emailStyles.heading}>Tour booking confirmed</Heading>
      <Text style={emailStyles.paragraph}>Dear {fullName},</Text>
      <Text style={emailStyles.paragraph}>
        Thank you for booking Homecoming tours. Your payment has been confirmed.
      </Text>

      <Text style={emailStyles.label}>Reference</Text>
      <Text style={emailStyles.value}>{referenceNumber}</Text>

      <Text style={emailStyles.label}>Tours</Text>
      {itemLines.map((line) => (
        <Text key={line} style={emailStyles.listItem}>
          {line}
        </Text>
      ))}

      <Text style={emailStyles.label}>Total paid</Text>
      <Text style={emailStyles.value}>{totalAmount}</Text>

      <Text style={emailStyles.paragraph}>
        We look forward to exploring Ghana with you.
      </Text>
    </EmailLayout>
  );
}

TourConfirmationEmail.PreviewProps = previewTourProps;
