import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Star } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ServiceReviewFormProps {
  serviceOrderId: string;
  existingReview?: { rating: number; comment: string | null } | null;
  onReviewSubmitted?: () => void;
}

const ServiceReviewForm = ({ serviceOrderId, existingReview, onReviewSubmitted }: ServiceReviewFormProps) => {
  const { user } = useAuth();
  const [rating, setRating] = useState(existingReview?.rating || 0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState(existingReview?.comment || "");
  const [submitting, setSubmitting] = useState(false);

  if (existingReview) {
    return (
      <Card className="border-primary/20">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-2">Vaše hodnocení</p>
          <div className="flex gap-1 mb-2">
            {[1, 2, 3, 4, 5].map(s => (
              <Star key={s} className={`w-5 h-5 ${s <= existingReview.rating ? "fill-primary text-primary" : "text-muted-foreground/30"}`} />
            ))}
          </div>
          {existingReview.comment && <p className="text-sm text-foreground/80">{existingReview.comment}</p>}
        </CardContent>
      </Card>
    );
  }

  const handleSubmit = async () => {
    if (!user || rating === 0) return;
    setSubmitting(true);
    const { error } = await supabase.from("service_reviews" as any).insert({
      service_order_id: serviceOrderId,
      user_id: user.id,
      rating,
      comment: comment.trim() || null,
    } as any);
    setSubmitting(false);
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Děkujeme za hodnocení! ⭐" });
    onReviewSubmitted?.();
  };

  return (
    <Card className="border-primary/20">
      <CardContent className="p-4 space-y-3">
        <p className="text-sm font-display font-semibold">Ohodnoťte servis</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(s => (
            <button
              key={s}
              onMouseEnter={() => setHoveredRating(s)}
              onMouseLeave={() => setHoveredRating(0)}
              onClick={() => setRating(s)}
              className="p-0.5 transition-transform hover:scale-110"
            >
              <Star className={`w-7 h-7 transition-colors ${
                s <= (hoveredRating || rating) ? "fill-primary text-primary" : "text-muted-foreground/30"
              }`} />
            </button>
          ))}
        </div>
        <Textarea
          placeholder="Napište komentář (nepovinné)..."
          value={comment}
          onChange={e => setComment(e.target.value)}
          rows={2}
          className="text-sm"
        />
        <Button onClick={handleSubmit} disabled={rating === 0 || submitting} size="sm" className="w-full">
          {submitting ? "Odesílám..." : "Odeslat hodnocení"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default ServiceReviewForm;
