import { createAgent, HumanMessage, tool } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";
import { z } from "zod";

// Avvia con: node --env-file=.env patterns.js

const model = new ChatAnthropic({
    model: "claude-haiku-4-5",
    apiKey: process.env.CLAUDE_API_KEY,
});


// ═══════════════════════════════════════════════════════════════════════════════
// PATTERN 1 — SUPERVISOR
// Un agente Supervisor legge la domanda e sceglie l'agente specializzato corretto.
// z.enum() garantisce che la scelta sia sempre uno dei valori previsti.
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n=== Pattern 1: Supervisor ===");

const getMeteoTool = tool(
    (input) => Promise.resolve(`Meteo per ${input.città}: soleggiato, 22°C`),
    {
        name: "get_meteo",
        description: "Restituisce le condizioni meteo attuali per una città.",
        schema: z.object({
            città: z.string().describe("Nome della città"),
        }),
    }
);

const agenteMeteo = createAgent({
    model,
    systemPrompt: "Sei un assistente meteo. Usa il tool per rispondere. Rispondi in italiano.",
    tools: [getMeteoTool],
});

const agenteGenerale = createAgent({
    model,
    systemPrompt: "Sei un assistente generico. Rispondi in italiano.",
    tools: [],
});

const supervisore = createAgent({
    model,
    systemPrompt: "Leggi la domanda e decidi se riguarda il meteo oppure è una domanda generica.",
    tools: [],
    responseFormat: z.object({
        agente: z.enum(["meteo", "generale"]).describe("L'agente da usare per rispondere"),
    }),
});

function chat(domanda) {
    return supervisore.invoke({ messages: [new HumanMessage(domanda)] })
        .then(risposta => {
            const scelta = risposta.structuredResponse.agente;
            // scelta è garantito essere "meteo" o "generale" grazie a z.enum()
            const agente = scelta === "meteo" ? agenteMeteo : agenteGenerale;
            console.log(`[Supervisor] domanda: "${domanda}" → agente: ${scelta}`);
            return agente.invoke({ messages: [new HumanMessage(domanda)] });
        })
        .then(risposta => console.log("Risposta:", risposta.messages.at(-1).content))
        .catch(err => console.error("Errore supervisor:", err));
}

chat("Che tempo fa a Milano?");
chat("Quante ore ha un giorno?");


// ═══════════════════════════════════════════════════════════════════════════════
// PATTERN 2 — PARALLEL
// Tre agenti analizzano la stessa proposta in contemporanea con Promise.all().
// Un aggregatore sintetizza i tre risultati in un giudizio finale.
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n=== Pattern 2: Parallel ===");

const agenteOttimista = createAgent({
    model,
    systemPrompt: "Analizza la proposta evidenziando solo opportunità e vantaggi. Rispondi in italiano.",
    tools: [],
});

const agentePessimista = createAgent({
    model,
    systemPrompt: "Analizza la proposta evidenziando solo rischi e problemi. Rispondi in italiano.",
    tools: [],
});

const agenteNeutro = createAgent({
    model,
    systemPrompt: "Analizza la proposta in modo obiettivo, senza prendere posizione. Rispondi in italiano.",
    tools: [],
});

const agenteAggregatore = createAgent({
    model,
    systemPrompt: `Ricevi tre analisi della stessa proposta (ottimista, pessimista, neutro).
Sintetizza un giudizio finale bilanciato in 3-4 righe. Rispondi in italiano.`,
    tools: [],
});

const proposta = "Aprire un negozio di abbigliamento online";
const messaggiAnalisi = [new HumanMessage(`Analizza questa proposta: "${proposta}"`)];

// I tre agenti partono contemporaneamente — il tempo totale è quello del più lento
Promise.all([
    agenteOttimista.invoke({ messages: messaggiAnalisi }),
    agentePessimista.invoke({ messages: messaggiAnalisi }),
    agenteNeutro.invoke({ messages: messaggiAnalisi }),
])
.then(([rispostaOttimista, rispostaPessimista, rispostaNeutro]) => {
    const analisi = {
        ottimista: rispostaOttimista.messages.at(-1).content,
        pessimista: rispostaPessimista.messages.at(-1).content,
        neutro: rispostaNeutro.messages.at(-1).content,
    };

    console.log("Analisi ricevute. Aggregazione in corso...");

    // L'aggregatore lavora solo sui testi già ricevuti, senza chiamate aggiuntive
    return agenteAggregatore.invoke({
        messages: [new HumanMessage(`
Ottimista: ${analisi.ottimista}

Pessimista: ${analisi.pessimista}

Neutro: ${analisi.neutro}
        `)]
    });
})
.then(risposta => console.log("Giudizio finale:\n", risposta.messages.at(-1).content))
.catch(err => console.error("Errore parallel:", err));


// ═══════════════════════════════════════════════════════════════════════════════
// PATTERN 3 — REFLECTION
// L'Esecutore genera una bozza. Il Critico la valuta: approva o rimanda.
// Il loop si ripete finché approvato o raggiunto maxIterazioni.
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n=== Pattern 3: Reflection ===");

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

const prodotto = "Scarpe da corsa ultraleggere";
const maxIterazioni = 3;

function eseguiLoop(bozza, iterazione) {
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
            // Il feedback viene passato nella bozza per il prossimo ciclo
            return eseguiLoop(`${nuovaBozza}\n\nFeedback: ${feedback}`, iterazione + 1);
        });
}

eseguiLoop("", 1).catch(err => console.error("Errore reflection:", err));
