import { createAgent, HumanMessage } from "langchain";
import model from "./models.js";

// ═══════════════════════════════════════════════════════════════════════════════
// PATTERN 2 — PARALLEL
// Tre agenti analizzano la stessa proposta in contemporanea con Promise.all().
// Un aggregatore sintetizza i tre risultati in un giudizio finale.
// ═══════════════════════════════════════════════════════════════════════════════

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

function patternParallel() {
    console.log("\n=== Pattern 2: Parallel ===");
    const proposta = "Aprire un negozio di abbigliamento online";
    const messaggiAnalisi = [new HumanMessage(`Analizza questa proposta: "${proposta}"`)];

    // I tre agenti partono contemporaneamente — il tempo totale è quello del più lento
    return Promise.all([
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
}

patternParallel();