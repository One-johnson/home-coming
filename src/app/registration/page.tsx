import { permanentRedirect } from "next/navigation";

/**
 * Registration is handled exclusively by hub representatives in /portal
 * (AGC 2026 flow). The legacy public form has been retired.
 */
export default function RegistrationPage() {
  permanentRedirect("/portal");
}
