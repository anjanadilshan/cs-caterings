# cs-caterings

## Project structure

```text
.
├── index.html, about.html, menu.html, store.html   # Main site pages
├── assets/
│   ├── css/                                         # Shared site styles
│   ├── js/                                          # Shared site scripts and Supabase client
│   └── images/                                      # Site images
├── event-booking/                                   # Booking pages, scripts, styles, and SQL
├── user-login/                                      # Account/admin pages, scripts, styles, and SQL
├── logs/                                            # Local diagnostic logs
├── .github/workflows/                               # GitHub deployment workflows
└── .vscode/                                         # Editor settings
```

The four main HTML pages remain in the project root so the existing site URLs stay the same. Feature-specific files remain grouped in `event-booking/` and `user-login/`.
