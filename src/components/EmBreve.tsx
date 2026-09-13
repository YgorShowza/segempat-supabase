import { motion } from "framer-motion";
import { Wrench } from "lucide-react";

export function EmBreve({ titulo }: { titulo: string }) {
  return (
    <div className="max-w-2xl mx-auto pt-16 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="rounded-2xl p-10"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-card, var(--shadow-md))",
        }}
      >
        <div
          className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
          style={{ background: "var(--accent-soft)" }}
        >
          <Wrench className="w-6 h-6" style={{ color: "var(--accent)" }} />
        </div>
        <h1
          className="text-xl font-black tracking-tight"
          style={{ color: "var(--text-1)", fontFamily: "var(--font-heading)" }}
        >
          {titulo}
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-3)" }}>
          Esta tela está sendo portada do app original e ficará disponível em breve.
        </p>
      </motion.div>
    </div>
  );
}
