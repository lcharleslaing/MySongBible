import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { QuickGematriaOverlay } from "./features/quick-gematria";
import "./styles/index.css";

const isQuickGematriaWindow = new URLSearchParams(window.location.search).get("quick-gematria") === "1";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isQuickGematriaWindow ? (
      <QuickGematriaOverlay />
    ) : (
      <BrowserRouter>
        <App />
      </BrowserRouter>
    )}
  </React.StrictMode>,
);
