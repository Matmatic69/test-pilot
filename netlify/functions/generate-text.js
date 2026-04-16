const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    // Health-check: allow GET to verify the function is deployed
    if (event.httpMethod === 'GET') {
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ok: true, name: 'generate-text', method: 'GET' })
        };
    }
    // La clé API doit être stockée dans les variables d'environnement de Netlify
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (e) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Requête invalide (JSON).' })
        };
    }

    const { prompt } = body;

    if (!prompt) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Le prompt est manquant.' })
        };
    }

    if (!OPENAI_API_KEY) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Clé API OpenAI manquante. Définissez OPENAI_API_KEY dans Netlify > Site configuration > Environment.' })
        };
    }

    const url = 'https://api.openai.com/v1/chat/completions';

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'Tu es une IA qui écrit en français des textes commémoratifs brefs, réconfortants et respectueux. Évite le mot "funérailles" sauf si explicitement demandé.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 400
            })
        });

        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch {
            return { statusCode: response.status, body: JSON.stringify({ error: 'Réponse invalide de l’API OpenAI.', details: text }) };
        }

        if (!response.ok) {
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: data.error?.message || 'Erreur API OpenAI', details: data })
            };
        }

        const generatedText = data.choices?.[0]?.message?.content?.trim() || '';

        return {
            statusCode: 200,
            body: JSON.stringify({ text: generatedText })
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Erreur interne du serveur.', details: error.message })
        };
    }
};
