export default function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
        <span className="text-white font-bold text-sm">M</span>
      </div>
      <div>
        <span className="text-base font-semibold text-gray-900 tracking-tight">Mediabox</span>
        <span className="text-[10px] text-blue-600 font-medium ml-1 align-super">2.0</span>
      </div>
    </div>
  );
}
