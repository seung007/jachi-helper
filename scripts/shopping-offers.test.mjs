import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import ShoppingOffers from "../shopping-offers.js";

const { offers, fresh, sort, cost, ttlMs } = ShoppingOffers;
const now = Date.parse("2026-10-06T19:45:00+09:00");

test("Observed offers retain exact sale-option IDs and matching images", () => {
  assert.equal(offers.length, 13);
  for (const offer of offers) {
    const url = new URL(offer.url);
    assert.equal(url.hostname, "www.coupang.com");
    assert(url.pathname.startsWith("/vp/products/"));
    assert(url.searchParams.get("itemId"));
    assert(url.searchParams.get("vendorItemId"));
    assert(existsSync(new URL(`..${offer.image}`, import.meta.url)));
    assert(fresh(offer, now));
  }
});

test("Per-use cost includes pack quantity and rejects invalid input", () => {
  assert.equal(cost(offers[0], 10100, 20), 63.125);
  assert.equal(cost(offers[1], 21900, 100), 21900 / 84);
  assert.equal(cost(offers[2], 16250, 20), 16250 / 135);
  for (const value of [0, -1, NaN, Infinity, "20", 4000]) assert.equal(cost(offers[0], 10100, value), null);
  for (const value of [0, -1, NaN, Infinity, 1e8, 100.5]) assert.equal(cost(offers[0], value, 20), null);
});

test("Observed prices expire without renewing on visits; sorting uses comparable units", () => {
  const checked = Date.parse(offers[0].checkedAt);
  assert.equal(fresh(offers[0], checked - 1), false);
  assert.equal(fresh(offers[0], checked + ttlMs - 1), true);
  assert.equal(fresh(offers[0], checked + ttlMs), false);
  assert.equal(fresh({ checkedAt: "invalid" }, now), false);
  const detergents = offers.filter((o) => o.itemId === "laundry-detergent");
  assert.equal(sort(detergents, "unit", now)[0].id, "liq-2100-4");
  assert.equal(sort(detergents, "price", now)[0].id, "acts-3200");
  assert.deepEqual(sort(offers, "unit", now + ttlMs).map((o) => o.id), offers.map((o) => o.id));
});

test("Food and household units respect packs and never rank unrelated items by unit price", () => {
  const byId = Object.fromEntries(offers.map((o) => [o.id, o]));
  assert.equal(Math.round(ShoppingOffers.unitPrice(byId["rice-6"])), 613);
  assert.equal(Math.round(ShoppingOffers.unitPrice(byId["rice-12"])), 554);
  assert.equal(ShoppingOffers.unitPrice(byId["zipbag-60"]), 156);
  assert.equal(ShoppingOffers.unitLabel(byId["paper-8"]), "100매당");
  assert.equal(ShoppingOffers.unitLabel(byId["dishsoap-500"]), "100g당");
  assert.equal(sort(offers.filter((o) => o.itemId === "food-rice"), "unit", now)[0].id, "rice-12");
  assert.deepEqual(sort(offers, "unit", now), offers);
  assert.equal(cost(byId["water-6"], 6340, 20), null);
});
