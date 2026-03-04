import { motion } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import { Phone, Mail, Clock, MapPin, Building2, Wrench, Car, Package, ExternalLink } from "lucide-react";

const contacts = [
  {
    icon: Phone,
    label: "Prodej & obchod",
    value: "+420 603 559 767",
    href: "tel:+420603559767",
  },
  {
    icon: Wrench,
    label: "Servis",
    value: "+420 603 372 911",
    href: "tel:+420603372911",
  },
  {
    icon: Phone,
    label: "Pevná linka",
    value: "+420 466 931 611",
    href: "tel:+420466931611",
  },
  {
    icon: Mail,
    label: "Email",
    value: "obchod@chrysler.cz",
    href: "mailto:obchod@chrysler.cz",
  },
];

const hours = [
  { day: "Pondělí", time: "8:00 – 11:30, 12:30 – 17:00" },
  { day: "Úterý", time: "8:00 – 11:30, 12:30 – 17:00" },
  { day: "Středa", time: "8:00 – 11:30, 12:30 – 17:00" },
  { day: "Čtvrtek", time: "8:00 – 11:30, 12:30 – 17:00" },
  { day: "Pátek", time: "8:00 – 11:30, 12:30 – 17:00" },
  { day: "Sobota – Neděle", time: "Zavřeno" },
];

const services = [
  "Dovoz a prodej vozů Chrysler, Dodge, Lancia",
  "Odborný značkový autoservis",
  "Výkup vozů za hotové",
  "Prodej originálních nových i použitých dílů Mopar",
  "Diagnostika – DRB II, DRB III, StarSCAN, Witech",
  "Servis a plnění klimatizací R1234yF / R134A",
  "Legalizace vozidel pro provoz v ČR, STK, ME",
];

const Contact = () => {
  return (
    <div className="min-h-screen pb-20">
      <PageHeader title="Kontakty" />
      <div className="p-4 space-y-4 max-w-lg mx-auto">

        {/* Company info */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-5"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-display font-semibold text-base">CHRYSLER PARDUBICE CHDP s.r.o.</h2>
              <p className="text-xs text-muted-foreground">IČO: 27527638</p>
            </div>
          </div>
          <div className="flex items-start gap-2 mt-3">
            <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm">Lukovna 11</p>
              <p className="text-sm text-muted-foreground">533 04 Sezemice, okr. Pardubice</p>
            </div>
          </div>
          <a
            href="https://www.chrysler.cz"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary mt-3 hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            www.chrysler.cz
          </a>
        </motion.div>

        {/* Contact cards */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="space-y-2"
        >
          {contacts.map((c, i) => (
            <motion.a
              key={i}
              href={c.href}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              className="glass-card p-4 flex items-center gap-3 active:scale-[0.98] transition-transform"
            >
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <c.icon className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-sm font-semibold truncate">{c.value}</p>
              </div>
            </motion.a>
          ))}
        </motion.div>

        {/* Opening hours */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-card p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Otevírací doba</h3>
          </div>
          <div className="space-y-1.5">
            {hours.map((h, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className={h.time === "Zavřeno" ? "text-muted-foreground" : ""}>{h.day}</span>
                <span className={`font-mono text-xs ${h.time === "Zavřeno" ? "text-muted-foreground" : "text-foreground"}`}>
                  {h.time}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3 italic">
            Mimo otevírací dobu dle domluvy.
          </p>
        </motion.div>

        {/* Services */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <Car className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Naše služby</h3>
          </div>
          <ul className="space-y-2">
            {services.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Map link */}
        <motion.a
          href="https://maps.google.com/?q=Lukovna+11,+Sezemice,+533+04"
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="glass-card p-4 flex items-center gap-3 active:scale-[0.98] transition-transform"
        >
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Zobrazit na mapě</p>
            <p className="text-xs text-muted-foreground">Lukovna 11, Sezemice</p>
          </div>
          <ExternalLink className="w-4 h-4 text-muted-foreground" />
        </motion.a>
      </div>
    </div>
  );
};

export default Contact;
