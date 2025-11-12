## 7. Non-Functional Requirements

### 7.1 Performance

**FR-P.1: Page Load Time**

- Initial app load: <2 seconds on 4G mobile networks
- Time to interactive: <3 seconds
- Measure: Using Lighthouse or similar performance benchmarking

**FR-P.2: Navigation Response Time**

- Passage navigation (clicking verse in left nav): <500ms
- Script switching (if added in Phase 1): Instant (client-side, <100ms)
- Commentary toggling: Instant (no delay)
- Bottom sheet opening/closing: Smooth animation, <300ms
- Column resizing: Smooth, no lag

**FR-P.3: Data Loading**

- Passage content loaded on-demand (lazy loading)
- Large texts (Brihad Aranyaka) load parts progressively, not all at once
- Commentary data fetched when first requested (not preloaded)

**FR-P.4: Rendering Performance**

- Smooth scrolling (60fps or better where supported)
- No jank or stuttering when scrolling through long passages
- Font rendering: Web fonts load without blocking text display (fallback fonts used initially)

**FR-P.5: Bundle Size**

- Initial JavaScript bundle: <300KB (gzipped)
- CSS: <50KB (gzipped)
- No large libraries loaded unnecessarily

**FR-P.6: Caching**

- Browser caching enabled for static assets (fonts, CSS, JS)
- Service worker (Phase 1+) for offline support
- Local storage used for user preferences and session state

---

### 7.2 Accessibility (WCAG 2.1 Level AA)

**FR-A.1: Color Contrast**

- All text meets WCAG AA contrast requirements (4.5:1 for normal text, 3:1 for large text)
- Dark mode provides adequate contrast
- No information conveyed by color alone

**FR-A.2: Keyboard Navigation**

- All interactive elements accessible via keyboard
- Tab order logical (left nav → primary text → commentary)
- Escape key closes modals/sheets
- No keyboard traps

**FR-A.3: Screen Reader Support**

- Semantic HTML used throughout (proper heading hierarchy, list markup, etc.)
- ARIA labels for buttons, icons, and custom components
- Form labels properly associated
- Image alternatives (if any images used)
- Cross-references announced as links

**FR-A.4: Text Scaling**

- Page remains usable when text scaled up to 200%
- No horizontal scrolling required at 200% zoom
- Font size adjustable (slider in settings)

**FR-A.5: Focus Management**

- Visible focus indicators on all interactive elements
- Focus visible when tabbing through UI
- Focus moves logically through page

**FR-A.6: Motion & Animation**

- No auto-playing animations that distract
- Bottom sheet animation can be disabled (prefers-reduced-motion)
- Animations are smooth and non-jarring

**FR-A.7: Readability**

- Default font size: 16px or larger
- Line height: 1.8-2.0 for readability
- Line length: ~60-80 characters for comfortable reading
- Generous margins and padding

---

### 7.3 Responsive Design

**FR-R.1: Mobile (<768px)**

- Single-column layout
- Full-width primary text
- Hamburger menu for navigation
- Bottom sheet for commentary
- Touch-friendly targets (min 44x44px tap targets)
- No horizontal scrolling

**FR-R.2: Tablet (768px - 1024px)**

- Hybrid 2-column layout (primary text + commentary)
- Left nav accessible via hamburger menu
- Resizable columns
- Both columns scroll independently

**FR-R.3: Desktop (>1024px)**

- 3-column layout (left nav | primary text | commentary)
- All elements visible simultaneously
- Resizable columns with visual dividers
- Spacious, scholarly feel

**FR-R.4: Orientation Support**

- App adapts to portrait and landscape on mobile/tablet
- Layout remains usable in both orientations
- No content lost when rotating device

---

### 7.4 Browser & Device Support

**FR-B.1: Browsers**

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions (iOS and macOS)
- Mobile browsers: Safari iOS 15+, Chrome Android

**FR-B.2: Devices**

- Desktop: Windows, macOS, Linux
- Mobile: iOS (12+), Android (8+)
- Tablet: iPad, Android tablets
- Screen sizes: 320px (small phone) to 4K (2560px+)

**FR-B.3: Graceful Degradation**

- App functions even if JavaScript fails (unlikely, but tested)
- Modern browsers get full experience
- Older browsers get degraded but functional experience
- Critical content always accessible

---

### 7.5 Reliability & Availability

**FR-L.1: Uptime SLA**

- Target: 99.5% uptime (production)
- Equivalent to ~3.6 hours downtime per month
- Monitored via uptime monitoring service

**FR-L.2: Data Backup**

- Daily automated backups of text data
- Backup stored separately from primary (geographic redundancy)
- Recovery time objective (RTO): <1 hour
- Recovery point objective (RPO): <24 hours

**FR-L.3: Error Handling**

- Graceful error messages when data fails to load
- "Unable to load commentary — please try again" (not cryptic errors)
- Retry logic for failed network requests
- User guidance on what to do if something breaks

**FR-L.4: Monitoring & Alerting**

- Error tracking system (Sentry or similar) logs exceptions
- Alerts for critical errors (e.g., if primary text fails to load)
- Alerts for performance degradation
- Logs available for debugging

**FR-L.5: Version Control & Rollback**

- All code and content in Git with full commit history
- Ability to rollback to previous version if needed
- Tagged releases (e.g., v0.1.0, v0.2.0)
- Clear deployment notes

---

### 7.6 Security

**FR-S.1: HTTPS**

- All traffic encrypted (HTTPS only)
- No HTTP fallback
- SSL/TLS certificate valid and auto-renewed
- Mixed content (HTTP + HTTPS) prevented

**FR-S.2: Data Privacy**

- No personally identifiable user data collected in Phase 0
- No analytics/tracking in Phase 0
- User preferences stored locally (localStorage) — not sent to server
- No third-party tracking cookies
- Privacy policy clearly stated (Phase 1+)

**FR-S.3: Input Validation**

- All user inputs validated (passage references, search queries, etc.)
- URL parameters validated before use
- No injection attacks (SQL, XSS) possible
- Content Security Policy (CSP) headers set

**FR-S.4: Authentication & Authorization**

- No user accounts in Phase 0
- Phase 1+: Authentication will be optional (for sync features)
- No sensitive data exposed in localStorage
- API endpoints (Phase 1+) require proper authorization

**FR-S.5: Dependency Security**

- Dependencies regularly audited for vulnerabilities
- Security patches applied promptly
- npm audit (or equivalent) run regularly
- Known vulnerabilities monitored

---

### 7.7 Internationalization (i18n)

**FR-I.1: Current Support (Phase 0)**

- UI language: English only
- Content: Sanskrit (Devanagari) only
- No i18n system required yet

**FR-I.2: Future Support (Phase 1+)**

- UI architecture designed for multi-language support
- Translation strings separated from code
- i18n library (e.g., i18next) to be added
- Support for: English, Sanskrit, possibly Hindi/Tamil/Telugu

**FR-I.3: Text Direction**

- Left-to-right (LTR) for English UI
- Right-to-left (RTL) support deferred (Sanskrit is LTR in Devanagari)

---

### 7.8 Scalability

**FR-Sc.1: Content Scaling**

- Architecture supports adding new granthas without code changes
- Database/JSON structure supports hundreds of texts
- No hard limits on number of passages per text
- Performance remains acceptable with 50+ granthas

**FR-Sc.2: User Scaling**

- No user accounts in Phase 0, so no user database scalability concerns
- Static content served efficiently (can use CDN)
- Concurrent users (if needed): Load testing deferred to Phase 1

**FR-Sc.3: Geographic Scaling**

- CDN (Cloudflare, AWS CloudFront, etc.) for static assets
- Text data can be served from single server or database in Phase 0
- Multi-region support deferred to Phase 2+

---

### 7.9 Maintainability & Code Quality

**FR-M.1: Code Standards**

- JavaScript/TypeScript: ESLint configured, strict rules
- Code formatting: Prettier (automatic formatting)
- Comments for non-obvious logic
- Consistent naming conventions

**FR-M.2: Testing**

- Unit tests for critical functions (data parsing, reference resolution, etc.)
- Integration tests for key workflows (text loading, navigation, etc.)
- Manual testing on multiple devices before release
- No automated E2E tests required in Phase 0 (manual testing sufficient)

**FR-M.3: Documentation**

- README with setup and deployment instructions
- Architecture documentation (high-level overview)
- Data schema documented (JSON schema or similar)
- API documentation (if backend API created)
- Code comments for complex logic

**FR-M.4: Build & Deployment**

- Automated build process (webpack, Vite, or similar)
- Automated linting and tests before deployment
- One-click (or CI/CD) deployment
- Version tags in Git corresponding to releases

---

### 7.10 Compatibility

**FR-C.1: Font Rendering**

- Devanagari rendering consistent across browsers/platforms
- Fallback fonts available if web fonts fail to load
- No corrupted or missing characters

**FR-C.2: Unicode Support**

- Full Unicode support for Devanagari (U+0900–U+097F)
- Special characters (diacritics, ligatures) render correctly
- Database and APIs handle UTF-8 correctly

**FR-C.3: Date/Time Handling**

- Timestamps in ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ)
- Timezone handling: All times stored in UTC
- User's timezone considerations deferred (always display UTC or no timezone info)

---

### 7.11 Usability & User Experience

**FR-U.1: Learning Curve**

- Intuitive interface; serious scholars should understand without training
- Help link in hamburger menu explains key features
- No confusing UI patterns or hidden functionality

**FR-U.2: Consistency**

- UI patterns consistent across all pages/views
- Terminology consistent (e.g., always "Vedanta Desika Bhashya", not "Vedanta Desika Commentary")
- Visual design consistent (colors, spacing, typography)

**FR-U.3: Feedback & Communication**

- Loading states visible (skeleton screens or spinners) if data takes >1 second
- Errors communicated clearly in user-friendly language
- Success messages for actions (e.g., "Preferences saved")
- Button states clear (active, disabled, hovered)

**FR-U.4: Error Recovery**

- Retry buttons for failed data loads
- Clear messaging on what went wrong
- No "dead end" errors — always a path forward

---

### 7.12 Localization (Phase 1+)

**FR-L.1: Ready for Localization**

- UI strings extracted and internationalized (Phase 1+)
- Content remains language-agnostic (Sanskrit is Sanskrit regardless of UI language)
- No hard-coded text in components

---

### 7.13 Performance Monitoring & Optimization (Phase 1+)

**FR-P.7: Analytics & Monitoring** (Deferred to Phase 1+)

- Page load times tracked
- Navigation latency monitored
- Error rates tracked
- User engagement metrics (optional, privacy-respecting)
- Performance dashboards available to developers

**FR-P.8: Optimization Strategy** (Phase 1+)

- Code splitting for large bundles
- Lazy loading of images and content
- Database query optimization
- Caching strategy review and tuning
- Regular performance audits (monthly or quarterly)

---

### 7.14 Disaster Recovery & Business Continuity

**FR-D.1: Backup Strategy**

- Daily automated backups
- Weekly full backups
- Monthly archived backups (retained for 1 year)
- Backup verification (test restores periodically)

**FR-D.2: Disaster Recovery Plan** (Phase 1+)

- RTO: <1 hour (system back online within 1 hour)
- RPO: <24 hours (lose at most 24 hours of data)
- Documented runbooks for common failure scenarios
- Regular disaster recovery drills

**FR-D.3: Data Integrity**

- Checksums for text files to detect corruption
- Automated consistency checks
- Alerts if data integrity issues detected
