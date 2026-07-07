import PageHeader from "@/components/PageHeader";
import BuyAndImport from "@/components/nabidka-vozu/BuyAndImport";

const VehicleOffer = () => {
  return (
    <div className="min-h-screen pb-20">
      <PageHeader title="Nabídka vozu" showBack />
      <div className="p-4 max-w-lg mx-auto">
        <BuyAndImport />
      </div>
    </div>
  );
};

export default VehicleOffer;
