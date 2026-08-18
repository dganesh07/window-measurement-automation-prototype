import { useState } from "react";
import TechForm from "./TechForm";
import ManagerDashboard from "./ManagerDashboard";
import "./App.css";

function App() {
  const [view, setView] = useState("tech");

  return (
    <div className="app">
      <header className="app-header">
        <h1>WindowCo Field Prototype</h1>
        <nav>
          <button className={view === "tech" ? "active" : ""} onClick={() => setView("tech")}>
            Technician
          </button>
          <button className={view === "manager" ? "active" : ""} onClick={() => setView("manager")}>
            Manager
          </button>
        </nav>
      </header>
      <main>{view === "tech" ? <TechForm /> : <ManagerDashboard />}</main>
    </div>
  );
}

export default App;
