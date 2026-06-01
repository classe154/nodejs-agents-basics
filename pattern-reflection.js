import { createAgent, HumanMessage } from "langchain";
import { z } from "zod";
import model from "./models.js";

// ═══════════════════════════════════════════════════════════════════════════════
// PATTERN 3 — REFLECTION  (difficoltà: alta — il più complesso dei tre pattern)
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

// Gestisce un singolo ciclo esecutore→critico e si richiama ricorsivamente se necessario
// bozza: testo dell'ultima versione; feedback: suggerimenti dell'iterazione precedente
function eseguiCiclo(prodotto, iterazione = maxIterazioni, bozza = "", feedback = "") {
    if (iterazione === 0) {
        console.log(`*** Limite di ${maxIterazioni} iterazioni raggiunto.`);
        return Promise.resolve(bozza);
    }

    const prompt = bozza === ""
        ? `Scrivi una descrizione per questo prodotto: "${prodotto}"`
        : `Riscrivi e migliora questa descrizione tenendo conto del feedback ricevuto:
${bozza}

Feedback: ${feedback}`;

    // nuovaBozza è dichiarata qui per essere visibile a entrambi i .then() successivi
    let nuovaBozza;

    return esecutore.invoke({ messages: [new HumanMessage(prompt)] })
        .then(risposta => {
            nuovaBozza = risposta.messages.at(-1).content;
            const iterazioneCorrente = maxIterazioni - iterazione + 1;
            console.log(`Iterazione ${iterazioneCorrente} — Bozza:\n${nuovaBozza}`);
            return critico.invoke({ messages: [new HumanMessage(`Valuta questa descrizione:\n${nuovaBozza}`)] });
        })
        .then(valutazione => {
            const { approvato, feedback: nuovoFeedback } = valutazione.structuredResponse;

            if (approvato) {
                console.log("Descrizione approvata!");
                return nuovaBozza;
            }

            console.log(`Feedback del critico: ${nuovoFeedback}`);
            // chiamata ricorsiva: passa bozza e feedback come argomenti separati
            return eseguiCiclo(prodotto, iterazione - 1, nuovaBozza, nuovoFeedback);
        });
}

function patternReflection(prodotto) {
    console.log("\n=== Pattern 3: Reflection ===");
    eseguiCiclo(prodotto)
        .then((versioneFinale) => {
            console.log(`Versione finale:\n${versioneFinale}`);
        })
        .catch(err => {
            console.error("Errore reflection:", err)
        });

}

patternReflection("Scarpe da corsa ultraleggere");