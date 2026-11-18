# Screen flows

Every screen of each portal, in the order a user meets it, with a screenshot and one line on what it is for. For how to demo each portal, see the [demo guides](../README.md).

| Portal | Screens |
|---|---|
| [Patient portal](patient.md) | 25 |
| [Doctor portal](doctor.md) | 21 |
| [Hospital portal](hospital.md) | 18 |
| [Visa lawyer portal](lawyer.md) | 14 |
| [Admin portal](admin.md) | 20 |

## Regenerating

The screenshots come from the local dev environment (in-memory demo data). With a **freshly started** API (the script signs up new accounts and approves the seeded pending doctor, hospital and lawyer) and Vite running:

```bash
cd e2e
API_LOG=<path to the API log> node screen-flows.mjs
```

It rewrites the images and these documents. A screen whose demo record is missing, or which redirects elsewhere, is skipped and listed at the end of the run.
