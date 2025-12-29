"use client";

type GenerationLevel = "UNIT" | "BOX" | "CARTON" | "PALLET";

interface Props {
  value: GenerationLevel;
  onChange: (level: GenerationLevel) => void;
}

export default function GenerationLevelSelector({
  value,
  onChange,
}: Props) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-2">
        Generation Level
      </label>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value as GenerationLevel)}
        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white"
      >
        <option value="UNIT">Unit (Product)</option>
        <option value="BOX">Box</option>
        <option value="CARTON">Carton</option>
        <option value="PALLET">Pallet</option>
      </select>
    </div>
  );
}

