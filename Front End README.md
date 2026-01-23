# RealSync User Interface

A modern React application built with Vite, TypeScript, and Tailwind CSS featuring a comprehensive UI component library.

## Prerequisites

Before running this project, ensure you have the following installed:
- **Node.js** (version 16.x or higher)
- **npm** (usually comes with Node.js)

To check if you have Node.js and npm installed:
```bash
node --version
npm --version
```

## Getting Started

Follow these steps to run the project locally:

### 1. Navigate to the Project Directory

```bash
cd "FRONT END CODE"
```

### 2. Install Dependencies

Install all required packages using npm:

```bash
npm install
```

This will install all dependencies listed in `package.json`, including:
- React 18.3.1
- TypeScript
- Vite (build tool)
- Radix UI components
- Tailwind CSS utilities
- Recharts (for data visualization)
- Supabase client
- And more...

### 3. Start the Development Server

Run the development server:

```bash
npm run dev
```

The application will start on a local development server (typically `http://localhost:5173`). The terminal will display the exact URL.

### 4. Open in Browser

Open your browser and navigate to the URL shown in the terminal (usually `http://localhost:5173`).

The page will automatically reload when you make changes to the source files.

## Available Scripts

- **`npm run dev`** - Starts the development server with hot reload
- **`npm run build`** - Creates an optimized production build in the `dist` folder

## Project Structure

```
FRONT END CODE/
├── src/
│   ├── components/          # React components
│   │   ├── figma/          # Figma-related components
│   │   ├── layout/         # Layout components (Sidebar, TopBar)
│   │   ├── screens/        # Screen components (Dashboard, Login, etc.)
│   │   └── ui/             # Reusable UI components (buttons, cards, etc.)
│   ├── lib/                # Utility libraries
│   │   ├── supabaseClient.ts  # Supabase configuration
│   │   └── utils.ts        # Helper functions
│   ├── styles/             # Global styles
│   │   └── globals.css     # Global CSS file
│   ├── assets/             # Static assets (images, icons)
│   ├── App.tsx             # Main application component
│   ├── main.tsx            # Application entry point
│   └── index.css           # Main CSS file
├── index.html              # HTML template
├── package.json            # Project dependencies and scripts
├── vite.config.ts          # Vite configuration
├── tsconfig.json           # TypeScript configuration
└── README.md               # This file
```

## Key Features

- **Modern React with TypeScript** - Type-safe component development
- **Vite** - Fast development server and optimized builds
- **Radix UI** - Accessible, unstyled UI components
- **Tailwind CSS** - Utility-first CSS framework
- **Recharts** - Composable charting library
- **Supabase** - Backend integration
- **Responsive Design** - Mobile-first approach

## Technologies Used

- **React** 18.3.1
- **TypeScript** 5.9.3
- **Vite** 6.3.5
- **Radix UI** - Component primitives
- **Lucide React** - Icon library
- **Recharts** - Charts and data visualization
- **Tailwind CSS** - Styling
- **Supabase** - Backend services

## Troubleshooting

### Port Already in Use

If port 5173 is already in use, Vite will automatically try the next available port. Check the terminal output for the actual URL.

### Installation Errors

If you encounter errors during `npm install`, try:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Module Not Found Errors

Ensure all dependencies are installed:
```bash
npm install
```

## Additional Notes

- The application uses **Supabase** for backend services. Make sure to configure your Supabase credentials in `src/lib/supabaseClient.ts` if needed.
- This project follows modern React patterns with functional components and hooks.
- All UI components are built with accessibility in mind using Radix UI primitives.

## Development

To modify the application:
1. Components are located in `src/components/`
2. Screens/pages are in `src/components/screens/`
3. Reusable UI components are in `src/components/ui/`
4. Global styles are in `src/styles/globals.css`

## Build for Production

To create a production build:

```bash
npm run build
```

The optimized files will be in the `dist` folder, ready for deployment.

---

For any issues or questions, please refer to the project documentation or contact the development team.
