import BuyAndImport from "@/components/nabidka-vozu/BuyAndImport";

const VehicleOffer = () => {
  return (
    <div className="min-h-screen pb-20">
      <div className="p-4 max-w-lg mx-auto">
        <h1 className="font-display text-2xl font-bold mb-4">Nabídka vozu</h1>
        <BuyAndImport />
      </div>
    </div>
  );
};

export default VehicleOffer;
