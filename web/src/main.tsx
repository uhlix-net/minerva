import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { App } from "./App";
import "./styles.css";

// A data router is needed for useBlocker (unsaved-changes prompt); App keeps its own <Routes>.
const router = createBrowserRouter([{ path: "*", element: <App /> }]);

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
