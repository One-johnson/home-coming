import { render } from "@react-email/render";
import { createElement, type ReactElement } from "react";
import RegistrationConfirmationEmail, {
  type RegistrationEmailProps,
} from "./registration-confirmation";
import RepCredentialsEmail, {
  type RepCredentialsEmailProps,
} from "./rep-credentials";
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

export async function renderRepCredentialsEmail(props: RepCredentialsEmailProps) {
  return renderEmail(RepCredentialsEmail, props);
}

export async function renderTourEmail(props: TourEmailProps) {
  return renderEmail(TourConfirmationEmail, props);
}
