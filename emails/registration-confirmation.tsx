import { Heading, Text } from "@react-email/components";
import { EmailLayout, emailStyles } from "./_components/EmailLayout";
import { previewRegistrationProps } from "./_lib/preview-data";

export type RegistrationEmailProps = {
  bannerUrl: string;
  recipientName: string;
  referenceNumber: string;
  ticketQuantity: number;
  addOnLines: string[];
  totalAmount: string;
  accommodationInterest: boolean;
};

export default function RegistrationConfirmationEmail({
  bannerUrl,
  recipientName,
  referenceNumber,
  ticketQuantity,
  addOnLines,
  totalAmount,
  accommodationInterest,
}: RegistrationEmailProps) {
  return (
    <EmailLayout
      preview={`Registration confirmed — ${referenceNumber}`}
      bannerUrl={bannerUrl}
    >
      <Heading style={emailStyles.heading}>Registration confirmed</Heading>
      <Text style={emailStyles.paragraph}>Dear {recipientName},</Text>
      <Text style={emailStyles.paragraph}>
        Thank you for registering for The Homecoming. Your payment has been
        confirmed and your spot is reserved.
      </Text>

      <Text style={emailStyles.label}>Reference</Text>
      <Text style={emailStyles.value}>{referenceNumber}</Text>

      <Text style={emailStyles.label}>Tickets</Text>
      <Text style={emailStyles.value}>{ticketQuantity}</Text>

      {addOnLines.length > 0 ? (
        <>
          <Text style={emailStyles.label}>Add-ons</Text>
          {addOnLines.map((line) => (
            <Text key={line} style={emailStyles.listItem}>
              {line}
            </Text>
          ))}
        </>
      ) : null}

      <Text style={emailStyles.label}>Total paid</Text>
      <Text style={emailStyles.value}>{totalAmount}</Text>

      {accommodationInterest ? (
        <Text style={emailStyles.muted}>
          You indicated interest in campus accommodation. Visit the accommodation
          page on the website to complete a booking.
        </Text>
      ) : null}

      <Text style={emailStyles.paragraph}>
        We look forward to welcoming you to Anagkazo Campus.
      </Text>
    </EmailLayout>
  );
}

RegistrationConfirmationEmail.PreviewProps = previewRegistrationProps;
