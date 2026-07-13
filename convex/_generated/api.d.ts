/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as content from "../content.js";
import type * as emails from "../emails.js";
import type * as galleryStorage from "../galleryStorage.js";
import type * as housing from "../housing.js";
import type * as http from "../http.js";
import type * as lib_referenceNumbers from "../lib/referenceNumbers.js";
import type * as lib_registrationConfig from "../lib/registrationConfig.js";
import type * as payments from "../payments.js";
import type * as registrations from "../registrations.js";
import type * as seed from "../seed.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  content: typeof content;
  emails: typeof emails;
  galleryStorage: typeof galleryStorage;
  housing: typeof housing;
  http: typeof http;
  "lib/referenceNumbers": typeof lib_referenceNumbers;
  "lib/registrationConfig": typeof lib_registrationConfig;
  payments: typeof payments;
  registrations: typeof registrations;
  seed: typeof seed;
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
