import { createAgent, HumanMessage } from "langchain";
import { z } from "zod";
import model from "./models.js";

// ═══════════════════════════════════════════════════════════════════════════════
// PATTERN 3 — REFLECTION
// L'Esecutore genera una bozza. Il Critico la valuta: approva o rimanda.
// Il loop si ripete finché approvato o raggiunto maxIterazioni.
// ═══════════════════════════════════════════════════════════════════════════════

const esecutore = createAgent({
    model,
    systemPrompt: "Scrivi descrizioni di prodotti per un e-commerce. Sii persuasivo e chiaro. Rispondi in italiano.",
    tools: [],
});

const critico = createAgent({
    model,
    systemPrompt: `Valuta le descrizioni prodotto.
Approva solo se sono persuasive, complete e senza errori.
Altrimenti indica cosa migliorare. Rispondi in italiano.`,
    tools: [],
    responseFormat: z.object({
        approvato: z.boolean().describe("true se la descrizione è pronta, false se va migliorata"),
        feedback: z.string().describe("Suggerimenti specifici per migliorare (vuoto se approvato)"),
    }),
});

const maxIterazioni = 3;

function patternReflection(prodotto, bozza = "", iterazione = 1) {
    if (iterazione === 1) console.log("\n=== Pattern 3: Reflection ===");

    if (iterazione > maxIterazioni) {
        console.log(`\nLimite di ${maxIterazioni} iterazioni raggiunto.`);
        console.log("Versione finale:\n", bozza);
        return Promise.resolve();
    }

    const prompt = bozza === ""
        ? `Scrivi una descrizione per questo prodotto: "${prodotto}"`
        : `Riscrivi e migliora questa descrizione tenendo conto del feedback ricevuto:\n${bozza}`;

    // nuovaBozza è dichiarata qui per essere visibile a entrambi i .then() successivi
    let nuovaBozza;

    return esecutore.invoke({ messages: [new HumanMessage(prompt)] })
        .then(risposta => {
            nuovaBozza = risposta.messages.at(-1).content;
            console.log(`\nIterazione ${iterazione} — Bozza:\n${nuovaBozza}`);
            return critico.invoke({ messages: [new HumanMessage(`Valuta questa descrizione:\n${nuovaBozza}`)] });
        })
        .then(valutazione => {
            const { approvato, feedback } = valutazione.structuredResponse;

            if (approvato) {
                console.log("\nDescrizione approvata!");
                console.log("Versione finale:\n", nuovaBozza);
                return Promise.resolve();
            }

            console.log(`Feedback del critico: ${feedback}`);
            // chiamata ricorsiva: passa la bozza aggiornata con il feedback all'iterazione successiva
            return patternReflection(prodotto, `${nuovaBozza}\n\nFeedback: ${feedback}`, iterazione + 1);
        });
}

patternReflection("Scarpe da corsa ultraleggere").catch(err => console.error("Errore reflection:", err));