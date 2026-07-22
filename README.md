Shopify → Odoo Order Connector

A small Python integration that imports orders from a Shopify store into Odoo as sales quotations. Built as a portfolio project to demonstrate Odoo external-API integration.

What it does

Reads recent orders from a Shopify store and creates a matching quotation in Odoo for each one — matching products by SKU, creating the customer if they don't exist yet, and never importing the same order twice.

How it works
Shopify (Admin API)  →  this script  →  Odoo (external API)
Pulls orders from Shopify's Admin API over HTTPS.
Logs into Odoo through its external API (XML-RPC).
Matches each Shopify line item to an Odoo product by SKU (Odoo's Internal Reference).
Finds the customer by email, or creates them if they're new.
Creates the order as a draft quotation for a person to review and confirm.
Stores the Shopify order number on the Odoo order and checks it before importing, so re-runs skip anything already imported.
Built with

Python (standard-library xmlrpc), requests, python-dotenv, the Shopify Admin API, and the Odoo external API.

Design decisions

The choices behind the build — the reasoning matters more than the code:

Polling, not webhooks. The script asks Shopify for orders when it runs (by hand, or on a schedule). Real-time delivery would use webhooks, which need an always-on public endpoint — out of scope for a single-file connector.
Match on SKU. SKUs are exact; product names carry spaces, accents and typos. Matching on the SKU (Odoo's Internal Reference) is the reliable link between the two systems.
Draft quotations, not confirmed orders. The connector brings orders in; a human reviews and confirms them. A safer default than auto-confirming.
Safe to re-run (idempotent). The Shopify order number is stored on the Odoo order and checked first, so the same order is never imported twice.
Secrets in environment variables. Credentials live in a .env file that is kept out of version control, so the code can be shared without exposing any passwords.
Setup
Python 3
pip install requests python-dotenv
Create a .env file (see .env.example) with your Odoo and Shopify credentials
python connector.py
Configuration

Set these in a .env file:

Variable	Description
ODOO_URL	Your Odoo instance URL
ODOO_DB	Odoo database name
ODOO_USER	Odoo login (email)
ODOO_KEY	Odoo API key
SHOPIFY_SHOP	Store domain, e.g. your-store.myshopify.com
SHOPIFY_TOKEN	Shopify Admin API access token (scopes: read_orders, read_products)
Limitations / possible next steps
Polling only, not real-time — a webhook version would import each order the moment it's placed.
Handles simple products; product variants (e.g. size options) are not mapped yet.
No built-in scheduling — in production it would be run by a scheduler (cron / Task Scheduler).
Minimal error handling and no persistent log.
Note

A self-built learning project, made to practise integrating an external store with Odoo.