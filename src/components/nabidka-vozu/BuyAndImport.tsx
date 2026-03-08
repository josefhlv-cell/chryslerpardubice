import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowDownUp, Plane } from "lucide-react";
import BuybackForm from "./BuybackForm";
import ImportForm from "./ImportForm";

const BuyAndImport = () => {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <Tabs defaultValue="buyback" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="buyback" className="gap-2">
            <ArrowDownUp className="w-4 h-4" />
            Výkup vozu
          </TabsTrigger>
          <TabsTrigger value="import" className="gap-2">
            <Plane className="w-4 h-4" />
            Individuální dovoz
          </TabsTrigger>
        </TabsList>
        <TabsContent value="buyback" className="mt-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground mb-4">
              Vyplňte údaje o vašem vozidle a my vám zašleme nezávaznou nabídku na výkup.
            </p>
            <BuybackForm />
          </div>
        </TabsContent>
        <TabsContent value="import" className="mt-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground mb-4">
              Popište váš vysněný vůz a my ho pro vás najdeme a dovezeme ze zahraničí.
            </p>
            <ImportForm />
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default BuyAndImport;
