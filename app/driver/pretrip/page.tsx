"use client";

import { useState } from "react";

type Status = "OK" | "MINOR" | "MAJOR";

type Item = {
  id: string;
  label: string;
  status: Status | null;
  note?: string;
  photo?: File | null;
};

const checklistTemplate: Item[] = [
  { id: "brakes", label: "Air Brake System", status: null },
  { id: "cab", label: "Cab", status: null },
  { id: "cargo", label: "Cargo Securement", status: null },
  { id: "coupling", label: "Coupling Devices", status: null },
  { id: "controls", label: "Driver Controls", status: null },
  { id: "seat", label: "Driver Seat", status: null },
  { id: "emergency", label: "Emergency Equipment", status: null },
  { id: "exhaust", label: "Exhaust System", status: null },
  { id: "fuel", label: "Fuel System", status: null },
  { id: "glass", label: "Glass & Mirrors", status: null },
  { id: "horn", label: "Horn", status: null },
  { id: "lights", label: "Lamps & Reflectors", status: null },
  { id: "steering", label: "Steering", status: null },
  { id: "suspension", label: "Suspension", status: null },
  { id: "tires", label: "Tires", status: null },
  { id: "wheels", label: "Wheels / Hubs", status: null },
  { id: "wipers", label: "Wipers / Washer", status: null },
];

export default function PreTripPage() {
  const [items, setItems] = useState<Item[]>(checklistTemplate);
  const [odometer, setOdometer] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const updateStatus = (id: string, status: Status) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status } : i))
    );
  };

  const updateNote = (id: string, note: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, note } : i))
    );
  };

  const updatePhoto = (id: string, file: File | null) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, photo: file } : i))
    );
  };

  const hasMajorDefect = items.some((i) => i.status === "MAJOR");

  const handleSubmit = async () => {
    // Validate all items checked
    const allChecked = items.every((i) => i.status !== null);
    if (!allChecked) {
      alert("Please complete all inspection items.");
      return;
    }

    setSubmitting(true);

    try {
      // TODO: Replace with your Supabase insert
      console.log("Submitting inspection:", {
        odometer,
        items,
        hasMajorDefect,
      });

      if (hasMajorDefect) {
        alert("MAJOR DEFECT — Vehicle OUT OF SERVICE");
        // BLOCK ROUTE
        return;
      }

      alert("Inspection completed — Route unlocked");

      // Redirect to driver route page
      window.location.href = "/driver-route";
    } catch (err) {
      console.error(err);
      alert("Error submitting inspection");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto text-white">
      <h1 className="text-xl font-bold mb-2">Pre-Trip Inspection</h1>

      <div className="bg-zinc-900 p-3 rounded-xl mb-4">
        <label className="text-sm">Odometer</label>
        <input
          className="w-full mt-1 p-2 rounded bg-zinc-800"
          value={odometer}
          onChange={(e) => setOdometer(e.target.value)}
          placeholder="Enter km"
        />
      </div>

      {items.map((item) => (
        <div key={item.id} className="bg-zinc-900 p-3 rounded-xl mb-3">
          <p className="mb-2 text-sm">{item.label}</p>

          <div className="flex gap-2 mb-2">
            <button
              className={`flex-1 p-2 rounded ${
                item.status === "OK" ? "bg-green-600" : "bg-zinc-800"
              }`}
              onClick={() => updateStatus(item.id, "OK")}
            >
              OK
            </button>

            <button
              className={`flex-1 p-2 rounded ${
                item.status === "MINOR" ? "bg-yellow-600" : "bg-zinc-800"
              }`}
              onClick={() => updateStatus(item.id, "MINOR")}
            >
              Minor
            </button>

            <button
              className={`flex-1 p-2 rounded ${
                item.status === "MAJOR" ? "bg-red-600" : "bg-zinc-800"
              }`}
              onClick={() => updateStatus(item.id, "MAJOR")}
            >
              Major
            </button>
          </div>

          {(item.status === "MINOR" || item.status === "MAJOR") && (
            <>
              <textarea
                placeholder="Describe defect..."
                className="w-full p-2 mb-2 rounded bg-zinc-800 text-sm"
                onChange={(e) => updateNote(item.id, e.target.value)}
              />

              <input
                type="file"
                className="text-xs"
                onChange={(e) =>
                  updatePhoto(item.id, e.target.files?.[0] || null)
                }
              />
            </>
          )}
        </div>
      ))}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full bg-blue-600 p-3 rounded-xl font-bold mt-4"
      >
        {submitting
          ? "Submitting..."
          : "Complete Pre-Trip & Start Route"}
      </button>

      {hasMajorDefect && (
        <p className="text-red-500 mt-3 text-center text-sm">
          Major defect detected — Route will be blocked
        </p>
      )}
    </div>
  );
}