# Sacred Texts Digital Library - Phase 0 MVP

A scholarly platform for accessing sacred texts with commentaries, built with Next.js, TypeScript, and Tailwind CSS.

## ✅ Completed Features

### Data Layer
- ✅ Transformed isavasya.json to new PRD-compliant format
- ✅ Created comprehensive TypeScript type definitions
- ✅ Built data repository layer with functions:
  - `getGrantha()` - Load complete grantha data
  - `getPassage()` - Get specific passage by reference
  - `getCommentariesForPassage()` - Filter commentaries
  - `buildNavigationStructure()` - Generate navigation tree
  - Navigation helpers (next/previous passage)

### State Management
- ✅ Custom `useLocalStorage` hook with SSR safety
- ✅ `usePreferences` hook managing:
  - Last visited location (grantha + passage)
  - Script preference (Devanagari/Roman/Kannada)
  - Language display (Both/Sanskrit/English)
  - Font size (80-150%)
  - Dark mode toggle
  - Selected commentaries
  - Column widths

### UI Components

#### Layout Components
- **Header** (`components/layout/Header.tsx`)
  - Grantha title display
  - Dark mode toggle
  - Preferences button

#### Reader Components
- **NavigationPanel** (`components/reader/NavigationPanel.tsx`)
  - Passage list with refs and fragments
  - Active passage highlighting
  - Prefatory/main/concluding indicators

- **TextDisplay** (`components/reader/TextDisplay.tsx`)
  - Sanskrit text with script switching
  - English translation support
  - Responsive font sizing
  - Footnotes display

- **CommentaryPanel** (`components/reader/CommentaryPanel.tsx`)
  - Multiple commentaries support
  - Expandable/collapsible sections
  - Prefatory material in commentaries
  - Commentary visibility toggle

#### UI Components
- **PreferencesPanel** (`components/ui/PreferencesPanel.tsx`)
  - Script selection
  - Language preference
  - Font size slider
  - Dark mode toggle
  - Reset to defaults

### Responsive Layout
- Desktop: 3-column layout (Navigation | Text | Commentary)
- Tablet: 2-column layout (Text | Navigation on toggle)
- Mobile: Single column with bottom sheet for commentary

### Theme System
- ✅ Complete dark mode implementation
- ✅ Persistent preference via localStorage
- ✅ Smooth transitions between themes
- ✅ Tailwind CSS dark mode utilities

## 🚀 Getting Started

### Running the Development Server

```bash
cd app
npm run dev
```

The application will be available at:
- Local: http://localhost:3000
- Network: http://10.0.0.37:3000

### Project Structure

```
claude-designed/
├── app/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                    # Home page (redirects to reader)
│   │   │   └── reader/
│   │   │       └── [granthaId]/
│   │   │           └── page.tsx            # Main reader page
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   └── Header.tsx              # Top navigation bar
│   │   │   ├── reader/
│   │   │   │   ├── NavigationPanel.tsx     # Left sidebar navigation
│   │   │   │   ├── TextDisplay.tsx         # Center text display
│   │   │   │   └── CommentaryPanel.tsx     # Right sidebar commentary
│   │   │   └── ui/
│   │   │       └── PreferencesPanel.tsx    # Preferences modal
│   │   └── lib/
│   │       ├── types.ts                    # TypeScript definitions
│   │       ├── data.ts                     # Data repository layer
│   │       └── hooks/
│   │           ├── useLocalStorage.ts      # localStorage hook
│   │           └── usePreferences.ts       # Preferences hook
│   └── public/
│       └── data/
│           └── isha_upanishad.json         # Grantha data
├── transform-data.ts                       # Data transformation script
└── validate-transformation.ts              # Validation script
```

## 📚 Available Texts

### Isha Upanishad
- **ID**: `isha_upanishad`
- **URL**: `/reader/isha_upanishad`
- **Passages**: 18 mantras + prefatory material
- **Commentary**: Vedanta Desika's commentary

## 🎨 Features in Detail

### Text Display
- Multiple script support (Devanagari, Roman, Kannada)
- Adjustable font size (80-150%)
- Sanskrit and English translations
- Responsive typography

### Navigation
- Quick passage jumping
- Visual indicators for passage types
- Text fragments for context
- Active passage highlighting

### Commentaries
- Multiple commentary support
- Toggle individual commentaries on/off
- Expandable/collapsible sections
- Prefatory material support
- Synchronized with main passage

### Preferences
- Persistent across sessions
- Real-time updates
- Reset to defaults option
- User-friendly modal interface

## 📋 Remaining Tasks (Future Phases)

### Phase 1 Features
- [ ] Cross-reference parsing and linking
- [ ] Mobile bottom sheet for commentary
- [ ] Search functionality
- [ ] Multiple grantha support
- [ ] Grantha selector UI

### Deployment
- [ ] Deploy to Vercel
- [ ] Configure custom domain
- [ ] Set up analytics
- [ ] Performance optimization

## 🔧 Technical Details

### Technologies
- **Framework**: Next.js 16.0.1 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State**: React Hooks + localStorage
- **Build Tool**: Turbopack

### Data Format
All texts follow the PRD-compliant schema with:
- Grantha metadata
- Prefatory/main/concluding passages
- Multiple commentary support
- Variant readings support
- Footnotes support

## 🎯 Phase 0 Goals (Completed)

✅ Single text (Isha Upanishad) with commentary
✅ Basic navigation and reading interface
✅ Responsive layout
✅ Dark mode support
✅ User preferences persistence
✅ Script and language switching
✅ Commentary display

## 📝 Notes

- The application uses client-side rendering for dynamic content
- All preferences are stored in localStorage
- The data is loaded from static JSON files
- Navigation is URL-based for deep linking support
- Dark mode preference is synchronized with system preference
