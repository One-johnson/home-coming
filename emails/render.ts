import { render } from "@react-email/render";
import { createElement, type ReactElement } from "react";
import AccommodationConfirmationEmail, {
  type AccommodationEmailProps,
} from "./accommodation-confirmation";
import RegistrationConfirmationEmail, {
  type RegistrationEmailProps,
} from "./registration-confirmation";
import TourConfirmationEmail, { type TourEmailProps } from "./tour-confirmation";

async function renderEmail<P extends object>(
  component: (props: P) => ReactElement,
  props: P,
) {
  const element = createElement(component, props);
  const html = await render(element);
  const text = await render(element, { plainText: true });
  return { html, text };
}

export async function renderRegistrationEmail(props: RegistrationEmailProps) {
  return renderEmail(RegistrationConfirmationEmail, props);
}

export async function renderAccommodationEmail(props: AccommodationEmailProps) {
  return renderEmail(AccommodationConfirmationEmail, props);
}

export async function renderTourEmail(props: TourEmailProps) {
  return renderEmail(TourConfirmationEmail, props);
}
