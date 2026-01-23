
  import { createRoot } from "react-dom/client";
  import App from "./App.tsx";
  import "./index.css";

  console.log('main.tsx loaded');

  const root = document.getElementById("root");
  if (!root) {
    console.error('Root element not found!');
  } else {
    console.log('Root element found, mounting React...');
    createRoot(root).render(<App />);
    console.log('React render called');
  }
