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
import type * as adminAuthData from "../adminAuthData.js";
import type * as agcAccommodation from "../agcAccommodation.js";
import type * as agcAdmin from "../agcAdmin.js";
import type * as agcAdminData from "../agcAdminData.js";
import type * as agcAuth from "../agcAuth.js";
import type * as agcAuthData from "../agcAuthData.js";
import type * as agcBookings from "../agcBookings.js";
import type * as agcExcel from "../agcExcel.js";
import type * as agcPortal from "../agcPortal.js";
import type * as authActions from "../authActions.js";
import type * as content from "../content.js";
import type * as crons from "../crons.js";
import type * as emailSendAction from "../emailSendAction.js";
import type * as emailSender from "../emailSender.js";
import type * as emails from "../emails.js";
import type * as galleryStorage from "../galleryStorage.js";
import type * as heroSlides from "../heroSlides.js";
import type * as http from "../http.js";
import type * as lib_agcConfig from "../lib/agcConfig.js";
import type * as lib_agcSettingsRuntime from "../lib/agcSettingsRuntime.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_bannerImage from "../lib/bannerImage.js";
import type * as lib_emailTemplates from "../lib/emailTemplates.js";
import type * as lib_eventConfig from "../lib/eventConfig.js";
import type * as lib_hotelConfig from "../lib/hotelConfig.js";
import type * as lib_hubUsername from "../lib/hubUsername.js";
import type * as lib_loginThrottle from "../lib/loginThrottle.js";
import type * as lib_paymentEmail from "../lib/paymentEmail.js";
import type * as lib_referenceNumbers from "../lib/referenceNumbers.js";
import type * as lib_registrationConfig from "../lib/registrationConfig.js";
import type * as lib_resetUrls from "../lib/resetUrls.js";
import type * as lib_smtpConfig from "../lib/smtpConfig.js";
import type * as lib_syncHotels from "../lib/syncHotels.js";
import type * as lib_syncTours from "../lib/syncTours.js";
import type * as lib_tourConfig from "../lib/tourConfig.js";
import type * as mediaThumbnails from "../mediaThumbnails.js";
import type * as registrationCatalog from "../registrationCatalog.js";
import type * as registrations from "../registrations.js";
import type * as schemaTypes from "../schemaTypes.js";
import type * as seed from "../seed.js";
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
  adminAuthData: typeof adminAuthData;
  agcAccommodation: typeof agcAccommodation;
  agcAdmin: typeof agcAdmin;
  agcAdminData: typeof agcAdminData;
  agcAuth: typeof agcAuth;
  agcAuthData: typeof agcAuthData;
  agcBookings: typeof agcBookings;
  agcExcel: typeof agcExcel;
  agcPortal: typeof agcPortal;
  authActions: typeof authActions;
  content: typeof content;
  crons: typeof crons;
  emailSendAction: typeof emailSendAction;
  emailSender: typeof emailSender;
  emails: typeof emails;
  galleryStorage: typeof galleryStorage;
  heroSlides: typeof heroSlides;
  http: typeof http;
  "lib/agcConfig": typeof lib_agcConfig;
  "lib/agcSettingsRuntime": typeof lib_agcSettingsRuntime;
  "lib/audit": typeof lib_audit;
  "lib/bannerImage": typeof lib_bannerImage;
  "lib/emailTemplates": typeof lib_emailTemplates;
  "lib/eventConfig": typeof lib_eventConfig;
  "lib/hotelConfig": typeof lib_hotelConfig;
  "lib/hubUsername": typeof lib_hubUsername;
  "lib/loginThrottle": typeof lib_loginThrottle;
  "lib/paymentEmail": typeof lib_paymentEmail;
  "lib/referenceNumbers": typeof lib_referenceNumbers;
  "lib/registrationConfig": typeof lib_registrationConfig;
  "lib/resetUrls": typeof lib_resetUrls;
  "lib/smtpConfig": typeof lib_smtpConfig;
  "lib/syncHotels": typeof lib_syncHotels;
  "lib/syncTours": typeof lib_syncTours;
  "lib/tourConfig": typeof lib_tourConfig;
  mediaThumbnails: typeof mediaThumbnails;
  registrationCatalog: typeof registrationCatalog;
  registrations: typeof registrations;
  schemaTypes: typeof schemaTypes;
  seed: typeof seed;
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
