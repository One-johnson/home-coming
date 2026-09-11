/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as authActions from "../authActions.js";
import type * as content from "../content.js";
import type * as emailSendAction from "../emailSendAction.js";
import type * as emailSender from "../emailSender.js";
import type * as emails from "../emails.js";
import type * as galleryStorage from "../galleryStorage.js";
import type * as heroSlides from "../heroSlides.js";
import type * as housing from "../housing.js";
import type * as http from "../http.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_bannerImage from "../lib/bannerImage.js";
import type * as lib_emailTemplates from "../lib/emailTemplates.js";
import type * as lib_eventConfig from "../lib/eventConfig.js";
import type * as lib_hotelConfig from "../lib/hotelConfig.js";
import type * as lib_paymentEmail from "../lib/paymentEmail.js";
import type * as lib_referenceNumbers from "../lib/referenceNumbers.js";
import type * as lib_registrationConfig from "../lib/registrationConfig.js";
import type * as lib_smtpConfig from "../lib/smtpConfig.js";
import type * as lib_syncHotels from "../lib/syncHotels.js";
import type * as lib_syncTours from "../lib/syncTours.js";
import type * as lib_tourConfig from "../lib/tourConfig.js";
import type * as mediaThumbnails from "../mediaThumbnails.js";
import type * as payments from "../payments.js";
import type * as paystackCheckout from "../paystackCheckout.js";
import type * as registrationCatalog from "../registrationCatalog.js";
import type * as registrations from "../registrations.js";
import type * as seed from "../seed.js";
import type * as stripeCheckout from "../stripeCheckout.js";
import type * as tourOrders from "../tourOrders.js";
import type * as tourPackages from "../tourPackages.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  authActions: typeof authActions;
  content: typeof content;
  emailSendAction: typeof emailSendAction;
  emailSender: typeof emailSender;
  emails: typeof emails;
  galleryStorage: typeof galleryStorage;
  heroSlides: typeof heroSlides;
  housing: typeof housing;
  http: typeof http;
  "lib/audit": typeof lib_audit;
  "lib/bannerImage": typeof lib_bannerImage;
  "lib/emailTemplates": typeof lib_emailTemplates;
  "lib/eventConfig": typeof lib_eventConfig;
  "lib/hotelConfig": typeof lib_hotelConfig;
  "lib/paymentEmail": typeof lib_paymentEmail;
  "lib/referenceNumbers": typeof lib_referenceNumbers;
  "lib/registrationConfig": typeof lib_registrationConfig;
  "lib/smtpConfig": typeof lib_smtpConfig;
  "lib/syncHotels": typeof lib_syncHotels;
  "lib/syncTours": typeof lib_syncTours;
  "lib/tourConfig": typeof lib_tourConfig;
  mediaThumbnails: typeof mediaThumbnails;
  payments: typeof payments;
  paystackCheckout: typeof paystackCheckout;
  registrationCatalog: typeof registrationCatalog;
  registrations: typeof registrations;
  seed: typeof seed;
  stripeCheckout: typeof stripeCheckout;
  tourOrders: typeof tourOrders;
  tourPackages: typeof tourPackages;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
