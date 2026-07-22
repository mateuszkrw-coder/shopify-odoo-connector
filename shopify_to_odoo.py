import xmlrpc.client
import requests

import os
from dotenv import load_dotenv

load_dotenv()

odoo_url = os.environ["ODOO_URL"]
odoo_db = os.environ["ODOO_DB"]
odoo_user = os.environ["ODOO_USER"]
odoo_key = os.environ["ODOO_KEY"]
shop = os.environ["SHOPIFY_SHOP"]
shopify_token = os.environ["SHOPIFY_TOKEN"]

# log into Odoo
common = xmlrpc.client.ServerProxy(f"{odoo_url}/xmlrpc/2/common")
uid = common.authenticate(odoo_db, odoo_user, odoo_key, {})
models = xmlrpc.client.ServerProxy(f"{odoo_url}/xmlrpc/2/object")

def odoo(model, method, *args, **kwargs):
    return models.execute_kw(odoo_db, uid, odoo_key, model, method, list(args), kwargs)

# 1. ask Shopify for recent orders
resp = requests.get(
    f"https://{shop}/admin/api/2025-01/orders.json?status=any",
    headers={"X-Shopify-Access-Token": shopify_token},
)
shopify_orders = resp.json().get("orders", [])
print(f"Shopify returned {len(shopify_orders)} order(s)")

# 2. turn each Shopify order into an Odoo quotation
for so in shopify_orders:
    # skip if this Shopify order is already in Odoo
    if odoo("sale.order", "search", [["client_order_ref", "=", so["name"]]], limit=1):
        print(f"  Order {so['name']}: already imported — skipped")
        continue
    # find or create the customer from the Shopify order
    cust = so.get("customer") or {}
    email = (so.get("email") or cust.get("email") or "").strip()
    cname = f"{cust.get('first_name', '')} {cust.get('last_name', '')}".strip()

    partner_ids = []
    if email:
        partner_ids = odoo("res.partner", "search", [["email", "=", email]], limit=1)
    if not partner_ids and cname:
        partner_ids = odoo("res.partner", "search", [["name", "=", cname]], limit=1)
    if not partner_ids:
        if cname or email:
            # we got customer info from Shopify → create the customer
            partner_ids = [odoo("res.partner", "create", {"name": cname or email, "email": email})]
            print(f"  Order {so['name']}: created customer '{cname or email}'")
        else:
            # Shopify redacted the customer (protected data) → use a fallback
            partner_ids = odoo("res.partner", "search", [["name", "=", "Shopify Guest"]], limit=1)
            if not partner_ids:
                partner_ids = [odoo("res.partner", "create", {"name": "Shopify Guest"})]
            print(f"  Order {so['name']}: no customer info — using 'Shopify Guest'")

    # build the order lines by matching SKU
    order_lines = []
    for item in so["line_items"]:
        sku = item.get("sku")
        product_ids = odoo("product.product", "search",
                           [["default_code", "=", sku]], limit=1) if sku else []
        if not product_ids:
            print(f"  Order {so['name']}: SKU '{sku}' not found in Odoo — line skipped")
            continue
        order_lines.append((0, 0, {
            "product_id": product_ids[0],
            "product_uom_qty": item["quantity"],
        }))

    if not order_lines:
        print(f"  Order {so['name']}: no matching products — order skipped")
        continue

    order_id = odoo("sale.order", "create", {
        "partner_id": partner_ids[0],
        "order_line": order_lines,
        "client_order_ref": so["name"],   # stores the Shopify order number, e.g. #1001
    })
    name = odoo("sale.order", "read", [order_id], fields=["name"])[0]["name"]
    print(f"  Order {so['name']} → created Odoo {name}")