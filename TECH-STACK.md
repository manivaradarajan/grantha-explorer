## Tech Stack Decision

### Frontend Framework: **Next.js**

**Decision:** Use Next.js with React + TypeScript

**Rationale:**

- Phase 0: Use as client-side SPA (no SSR needed)
- Phase 1+: API routes already built-in for backend features (search, auth, database)
- Single codebase for frontend + backend (easier scaling)
- File-based routing aligns naturally with text structure (`/[grantha]/[verse]`)
- Vercel deployment seamless (though can self-host)
- TypeScript first-class support
- Large ecosystem, excellent documentation

**Alternatives Considered & Rejected:**

- React + Vite: Great for Phase 0, but Phase 1 requires separate backend codebase
- SvelteKit: Smaller ecosystem, less familiar
- Plain HTML/CSS/JS: No ecosystem, manual everything

---

### Styling: **Tailwind CSS**

**Decision:** Tailwind CSS for utility-first styling

**Rationale:**

- Rapid development (class-based, no context switching to CSS files)
- Consistent spacing, colors, typography
- Works perfectly with Next.js
- Easy to maintain and extend
- Responsive design built-in (`md:`, `lg:`, etc.)
- Small production bundle with purging

**Setup:**

- Install: `npm install -D tailwindcss postcss autoprefixer`
- Configure: `tailwind.config.ts`
- Import in `globals.css`: `@tailwind base; @tailwind components; @tailwind utilities;`

---

### UI Components: **Custom + Shadcn/ui** (Optional)

**Decision:** Build core components custom, consider Shadcn/ui for complex components

**Rationale for Phase 0:**

- Most components are simple (text display, buttons, toggles)
- Custom components give full control
- Shadcn/ui can be added later if needed (e.g., for modals, sheets, dropdowns)

**If using Shadcn/ui:**

- `npx shadcn-ui@latest init` (sets up component library)
- Install components as needed (e.g., `npx shadcn-ui@latest add button`)
- All components are Tailwind-based, copy into `/components/ui/`

---

### State Management: **React Context + localStorage**

**Decision:** React Context API for UI state, localStorage for persistence

**Rationale:**

- No backend in Phase 0, so no Redux/TanStack Query needed
- localStorage handles session persistence (last verse, preferences)
- Simple and sufficient for Phase 0
- Easy to migrate to backend/database in Phase 1

**What to Store in localStorage:**

- Last visited grantha and verse
- Script preference (Devanagari only in Phase 0)
- Language toggle state (both/sanskrit-only in Phase 0)
- Selected commentaries (which are checked)
- Font size preference
- Dark mode preference
- Column widths (desktop)

**Implementation:**

```typescript
// hooks/usePreferences.ts
const usePreferences = () => {
  const [preferences, setPreferences] = useState(() => {
    const saved = localStorage.getItem("preferences");
    return saved ? JSON.parse(saved) : defaultPreferences;
  });

  useEffect(() => {
    localStorage.setItem("preferences", JSON.stringify(preferences));
  }, [preferences]);

  return [preferences, setPreferences];
};
```

---

### Data Storage (Phase 0): **JSON Files in GitHub**

**Decision:** Store texts as JSON files in `/public/data/` folder, versioned in GitHub

**Rationale:**

- Phase 0 is read-only (no user-generated data)
- JSON files are simple, auditable, version-controlled
- Served as static assets from `/public/` (fast, CDN-cacheable)
- Easy to update/iterate (push to GitHub, auto-deploy)
- Free, no database infrastructure needed

**File Structure:**

```
/public/data/
  ├─ isha_upanishad.json
  ├─ kena_upanishad.json
  ├─ ... (10 Principal Upanishads + additional)
  └─ commentaries/
      ├─ vedanta_desika.json
      ├─ rangaramanuja.json
      └─ kuranarayana.json
```

**Data Format:** See PRD Section 6 (JSON Schema)

**Fetching:**

```typescript
// lib/data.ts
export async function getGrantha(grancthaId: string) {
  const response = await fetch(`/data/${grancthaId}.json`);
  return response.json();
}
```

---

### Database (Phase 1+): **Supabase (PostgreSQL + Auth)**

**Decision:** Defer to Phase 1, but recommend Supabase

**Rationale:**

- PostgreSQL under the hood (robust, scalable)
- Built-in authentication (for user accounts Phase 1+)
- Real-time API (good for future features)
- Serverless (no infrastructure management)
- Free tier generous
- Easy to migrate from JSON files

**Phase 1 Migration Path:**

1. Export JSON data to SQL
2. Set up Supabase project
3. Create tables for texts, commentaries, user preferences
4. Replace `/public/data/` fetches with Supabase API calls
5. Add auth routes to Next.js API

---

### Build & Deployment: **Vercel**

**Decision:** Deploy to Vercel

**Rationale:**

- Native Next.js hosting (built by creators of Next.js)
- Automatic deploys from GitHub (push to main = live)
- Environment variables, secrets management built-in
- Edge network (fast global CDN)
- Free tier sufficient for Phase 0
- Easy to upgrade to Pro for Phase 1+ features (analytics, etc.)

**Setup:**

1. Connect GitHub repo to Vercel
2. Set environment variables (if any)
3. Deploy (automatic on every push to `main`)

**Alternative:** Self-hosted on Digital Ocean, AWS, etc. (supported, but more manual)

---

### Testing: **Vitest + Manual Testing**

**Decision:** Vitest for unit tests, manual testing for UI/integration

**Rationale for Phase 0:**

- Unit tests for critical functions (reference parsing, data loading, etc.)
- Manual testing on multiple devices before release
- E2E tests (Playwright, Cypress) deferred to Phase 1+
- Faster iteration without heavy test infrastructure

**Setup:**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

**Example Test:**

```typescript
// lib/__tests__/references.test.ts
import { describe, it, expect } from "vitest";
import { parseReference } from "../references";

describe("parseReference", () => {
  it('parses "1.1" correctly', () => {
    expect(parseReference("1.1")).toEqual({ grantha: "isha", verse: "1.1" });
  });
});
```

---

### Language & Type Safety: **TypeScript**

**Decision:** TypeScript for all code

**Rationale:**

- Type safety catches errors early
- Better IDE support (autocomplete, refactoring)
- Self-documenting code
- Easier collaboration
- Next.js has excellent TypeScript support

**Setup:** Already built-in with Next.js (just use `.tsx` and `.ts` files)

---

### Package Manager: **npm or pnpm**

**Decision:** npm (default), or pnpm for faster installs

**Rationale:**

- npm: Standard, widely understood, no additional setup
- pnpm: Faster, less disk space (optional upgrade)

**Recommendation for Phase 0:** Use npm (no reason to complicate)

---

### Environment Variables

**Setup:** Create `.env.local` file (not committed to Git)

```
# .env.local (Phase 0 - minimal)
NEXT_PUBLIC_APP_NAME=Grantha Vibhrama
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000

# Phase 1+ will add:
# SUPABASE_URL=...
# SUPABASE_KEY=...
```

**Note:** Variables prefixed with `NEXT_PUBLIC_` are exposed to client-side code (safe to use)

---

### Development Workflow

**Install dependencies:**

```bash
npm install
```

**Start dev server:**

```bash
npm run dev
# Open http://localhost:3000
```

**Build for production:**

```bash
npm run build
npm run start
```

**Lint & format:**

```bash
npm run lint
npm run format  # if Prettier configured
```

---

### Performance Targets (Built-in with Next.js)

- **Bundle Size:** ~200KB (gzipped, including Next.js overhead)
- **First Load:** <2 seconds on 4G (Vercel Edge Network)
- **Navigation:** <500ms (client-side routing, instant)
- **Core Web Vitals:** Pass (Vercel monitors automatically)

---

### Phase 1 Extensions (Prepared, Not Yet Implemented)

- **Search:** Add API route `/api/search` with PostgreSQL full-text search
- **Auth:** Supabase auth integration (sign-up, login, user preferences sync)
- **Database:** Migrate from JSON files to Supabase
- **API:** Additional routes for user data, bookmarks, etc.
- **Middleware:** Authentication middleware for protected routes

---

### Summary: Tech Stack for Claude Code

| Layer               | Decision                      | Reason                                             |
| ------------------- | ----------------------------- | -------------------------------------------------- |
| Framework           | Next.js                       | Phase 1 extensibility, API routes, deployment ease |
| Language            | TypeScript                    | Type safety, IDE support                           |
| Styling             | Tailwind CSS                  | Rapid dev, consistency, responsive                 |
| State               | React Context + localStorage  | Simple, sufficient for Phase 0                     |
| Data (Phase 0)      | JSON in `/public/data/`       | Version-controlled, auditable, static              |
| Database (Phase 1+) | Supabase PostgreSQL           | Scalable, auth built-in, easy migration            |
| Deployment          | Vercel                        | Native Next.js, automatic deploys, CDN             |
| Testing             | Vitest + manual               | Sufficient for Phase 0, E2E Phase 1+               |
| Components          | Custom + Shadcn/ui (optional) | Full control, add complexity as needed             |

---

### Getting Started for Claude Code

1. Initialize Next.js project:

   ```bash
   npx create-next-app@latest grantha-explorer --typescript --tailwind
   ```

2. Project structure:

   ```
   /app
     /[grantha]
       /[verse]
         page.tsx          # Main reading view
     page.tsx              # Landing/home
   /components
     /ui
       Button.tsx
       Sheet.tsx           # Bottom sheet for mobile
       NavigationSidebar.tsx
     Header.tsx
     CommentaryPanel.tsx
   /lib
     data.ts               # JSON loading
     references.ts         # Reference parsing/linking
     utils.ts
   /public/data/
     *.json                # Text data files
   /styles
     globals.css           # Tailwind setup
   ```

3. Start coding per PRD specifications (Sections 4-7)

---

**Claude Code can now proceed with this stack.**
