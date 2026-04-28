import GlobalOEMSearch from "@/components/catalog/GlobalOEMSearch";

const Index = () => {
  const handleOrder = (part: any) => {
    console.log("OBJEDNAT:", part);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">
          🔎 Vyhledávání dílů
        </h1>

        <GlobalOEMSearch onOrder={handleOrder} />
      </div>
    </div>
  );
};

export default Index;