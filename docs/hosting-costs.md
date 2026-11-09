# Hosting budget — 09 November 2026

The owner selected **₹0/month: free demo, heavier services run locally**. No subscriptions, servers or paid services have been purchased.

## Selected deployment

| Component                     | Selected approach                                          | Recurring provider charge                            |
| ----------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| Source repository             | Public GitHub repository                                   | ₹0                                                   |
| Web application               | Vercel Hobby, subject to its personal/non-commercial terms | ₹0 within limits                                     |
| Application database          | Supabase Free PostgreSQL                                   | ₹0 within limits                                     |
| Hosted project files          | Private Supabase Storage bucket                            | ₹0 within limits                                     |
| Collaborative editing service | Local Node/Hocuspocus process for the demo                 | ₹0 additional hosting fee                            |
| Office editing service        | Local office-editor service, once installed and integrated | ₹0 hosting fee; third-party license conditions apply |
| Code runner                   | Local Docker containers, once installed and verified       | ₹0 additional hosting fee                            |
| Error tracking                | Optional Sentry Developer plan                             | ₹0 within limits                                     |
| Domain                        | Provider subdomain                                         | ₹0                                                   |

Total additional recurring provider charge: **₹0/month and ₹0/year**, assuming usage stays within free quotas and local services use existing equipment. Electricity, internet, hardware, any optional domain and development tooling are not included. This is a personal portfolio demo configuration, not an uptime commitment.

Supabase Free currently includes 500 MB of database storage, 1 GB file storage, 5 GB uncached egress and 5 GB cached egress. Inactive projects can pause after a week. A 4 MiB file downloaded 100 times uses about 400 MiB of transfer before overhead. Approximately 250 files of that size exhaust 1 GiB before metadata or version history. FLOWSTATE currently limits individual uploads to 4 MiB and each project's metadata-accounted files to 100 MiB; multiple projects can still exhaust the provider's shared allowance.

Local services are available only while the machine and required processes are running. A website opened from Vercel cannot use another visitor's `localhost` to reach this development machine. A public demo therefore needs explicitly configured, authenticated HTTPS/WSS endpoints (for example a suitable tunnel) or must demonstrate those capabilities locally. No tunnel or public runner has been activated. Do not expose the existing local Docker runner directly.

References: [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Supabase pricing](https://supabase.com/pricing), [Sentry pricing](https://sentry.io/pricing/), [ONLYOFFICE Community license information](https://helpcenter.onlyoffice.com/docs/installation/community/faq).

## Paid comparison, not the selected plan

For a low-concurrency cloud demo, a conservative illustrative allocation is an 8 GiB DigitalOcean Basic server for the application/collaboration/office services ($48/month) and a separate 2 GiB server for one bounded runner ($12/month). Compute total: **$60/month, $720/year**, before tax, backups, extra storage/traffic and domains. The 2 GiB runner estimate assumes one small workload; it is not sized for the current development maximum of four concurrent containers.

The ECB's 06 November reference values were EUR/INR 104.8645 and EUR/USD 1.1165. Crossing those gives about ₹93.92/USD, making the compute-only comparison approximately **₹5,635/month or ₹67,624/year**. Exchange spreads and actual invoices will differ. This is a planning estimate, not a checkout quote or a performance guarantee.

Lower listed Hetzner CX prices exist, but its public page reported the cost-optimized category unavailable during research. Do not base a deployment promise on that inventory.

References: [DigitalOcean server pricing](https://www.digitalocean.com/pricing/droplets), [ECB exchange rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.eu.html), [Hetzner availability](https://www.hetzner.com/cloud/), [ONLYOFFICE Docker requirements](https://helpcenter.onlyoffice.com/docs/installation/community/docker/installing/install).

## Execution dependencies

Local source and database changes can proceed without buying anything. Docker and WSL are not installed on the current Windows machine. Office editing and terminal execution cannot be verified live until those prerequisites are installed and running. Hosted activation also requires the owner's Vercel/Supabase accounts and credentials; keep those out of chat. GitHub publication is pending repository creation/access, not the product's optional GitHub App.
