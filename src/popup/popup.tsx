import { createRoot } from "react-dom/client";

function App() {
  return <div>Local Storage Inspector</div>;
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
