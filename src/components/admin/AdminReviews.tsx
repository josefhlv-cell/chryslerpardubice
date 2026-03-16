import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Star, Loader2 } from "lucide-react";

const AdminReviews = () => {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from("service_reviews" as any).select("*").order("created_at", { ascending: false });
      setReviews((data as any[]) || []);
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : "—";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1">
          <Star className="w-5 h-5 fill-primary text-primary" />
          <span className="text-2xl font-display font-bold">{avgRating}</span>
        </div>
        <span className="text-sm text-muted-foreground">z {reviews.length} hodnocení</span>
      </div>
      {reviews.map(r => (
        <Card key={r.id}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={s} className={`w-3.5 h-3.5 ${s <= r.rating ? "fill-primary text-primary" : "text-muted-foreground/30"}`} />
                ))}
              </div>
              <span className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString("cs-CZ")}</span>
            </div>
            {r.comment && <p className="text-sm text-foreground/80">{r.comment}</p>}
          </CardContent>
        </Card>
      ))}
      {reviews.length === 0 && <p className="text-center text-muted-foreground py-8">Zatím žádné hodnocení</p>}
    </div>
  );
};

export default AdminReviews;
