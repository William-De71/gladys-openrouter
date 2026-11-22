// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: connection statuses, the result of the test button, the widget.
// German says "du", Spanish "usted", like Gladys. Model names are never
// translated.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // connection status and test action
  statusNoKey: {
    en: 'No OpenRouter API key: create one on openrouter.ai/keys and paste it in the configuration.',
    fr: 'Pas de clé d’API OpenRouter : créez-en une sur openrouter.ai/keys et collez-la dans la configuration.',
    de: 'Kein OpenRouter-API-Schlüssel: Erstelle einen auf openrouter.ai/keys und füge ihn in die Konfiguration ein.',
    es: 'No hay clave de API de OpenRouter: cree una en openrouter.ai/keys y péguela en la configuración.',
  },
  statusBadKey: {
    en: 'OpenRouter refused the API key: check it, or create a new one on openrouter.ai/keys.',
    fr: 'OpenRouter a refusé la clé d’API : vérifiez-la, ou créez-en une nouvelle sur openrouter.ai/keys.',
    de: 'OpenRouter hat den API-Schlüssel abgelehnt: Prüfe ihn oder erstelle einen neuen auf openrouter.ai/keys.',
    es: 'OpenRouter ha rechazado la clave de API: compruébela o cree una nueva en openrouter.ai/keys.',
  },
  statusNoCredits: {
    en: 'No OpenRouter credits left, or the spending limit of the key is reached: add credits or raise the limit on openrouter.ai.',
    fr: 'Plus de crédits OpenRouter, ou la limite de dépense de la clé est atteinte : ajoutez des crédits ou relevez la limite sur openrouter.ai.',
    de: 'Keine OpenRouter-Credits mehr oder das Ausgabelimit des Schlüssels ist erreicht: Lade Credits auf oder erhöhe das Limit auf openrouter.ai.',
    es: 'No quedan créditos de OpenRouter o se ha alcanzado el límite de gasto de la clave: añada créditos o aumente el límite en openrouter.ai.',
  },
  statusNoModel: {
    en: '{model} is not available on OpenRouter, or no provider matches the privacy setting: check the model id or choose another model.',
    fr: '{model} n’est pas disponible sur OpenRouter, ou aucun fournisseur ne respecte le réglage de confidentialité : vérifiez l’identifiant ou choisissez un autre modèle.',
    de: '{model} ist auf OpenRouter nicht verfügbar oder kein Anbieter erfüllt die Datenschutzeinstellung: Prüfe die Modell-ID oder wähle ein anderes Modell.',
    es: '{model} no está disponible en OpenRouter o ningún proveedor cumple el ajuste de privacidad: compruebe el identificador o elija otro modelo.',
  },
  statusNoCustom: {
    en: 'A model is set to “Other model” but the model id field is empty or invalid.',
    fr: 'Un modèle est réglé sur « Autre modèle » mais le champ de l’identifiant est vide ou invalide.',
    de: 'Ein Modell steht auf „Anderes Modell“, aber das Feld der Modell-ID ist leer oder ungültig.',
    es: 'Un modelo está en «Otro modelo» pero el campo del identificador está vacío o no es válido.',
  },
  statusNoTools: {
    en: '{model} cannot call tools: the assistant will not be able to control Gladys.',
    fr: '{model} ne sait pas appeler d’outils : l’assistant ne pourra pas piloter Gladys.',
    de: '{model} kann keine Werkzeuge aufrufen: Der Assistent kann Gladys nicht steuern.',
    es: '{model} no puede llamar a herramientas: el asistente no podrá controlar Gladys.',
  },
  statusFreeLimits: {
    en: 'Free models are limited to 20 requests a minute and 50 a day (1,000 after buying 10 credits), and the router counts one request per chat message.',
    fr: 'Les modèles gratuits sont limités à 20 requêtes par minute et 50 par jour (1 000 après l’achat de 10 crédits), et le routeur compte une requête par message du chat.',
    de: 'Kostenlose Modelle sind auf 20 Anfragen pro Minute und 50 pro Tag begrenzt (1.000 nach dem Kauf von 10 Credits), und der Router zählt eine Anfrage pro Chat-Nachricht.',
    es: 'Los modelos gratuitos están limitados a 20 solicitudes por minuto y 50 al día (1000 tras comprar 10 créditos), y el enrutador cuenta una solicitud por mensaje del chat.',
  },
  statusRateLimited: {
    en: 'OpenRouter rate limit reached: try again in a moment, or choose a paid model.',
    fr: 'Limite de requêtes OpenRouter atteinte : réessayez dans un instant, ou choisissez un modèle payant.',
    de: 'OpenRouter-Anfragelimit erreicht: Versuche es gleich noch einmal oder wähle ein kostenpflichtiges Modell.',
    es: 'Se ha alcanzado el límite de solicitudes de OpenRouter: inténtelo de nuevo en un momento o elija un modelo de pago.',
  },
  statusUnreachable: {
    en: 'Cannot reach openrouter.ai: check the internet access of Gladys.',
    fr: 'Impossible de joindre openrouter.ai : vérifiez l’accès Internet de Gladys.',
    de: 'openrouter.ai ist nicht erreichbar: Prüfe den Internetzugang von Gladys.',
    es: 'No se puede acceder a openrouter.ai: compruebe el acceso a Internet de Gladys.',
  },
  statusApiError: {
    en: 'OpenRouter error: {detail}',
    fr: 'Erreur d’OpenRouter : {detail}',
    de: 'OpenRouter-Fehler: {detail}',
    es: 'Error de OpenRouter: {detail}',
  },
  statusInitFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: 'L’initialisation a échoué, consultez les journaux de l’intégration.',
    de: 'Die Initialisierung ist fehlgeschlagen, prüfe die Protokolle der Integration.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
  role_chat: { en: 'Chat', fr: 'Discussion', de: 'Chat', es: 'Chat' },
  role_router: { en: 'Router', fr: 'Routeur', de: 'Router', es: 'Enrutador' },
  testAnswered: {
    en: '{model} answered in {seconds} s.',
    fr: '{model} a répondu en {seconds} s.',
    de: '{model} hat in {seconds} s geantwortet.',
    es: '{model} ha respondido en {seconds} s.',
  },
  testAnsweredVia: {
    en: '{model} answered in {seconds} s (with {via}).',
    fr: '{model} a répondu en {seconds} s (avec {via}).',
    de: '{model} hat in {seconds} s geantwortet (mit {via}).',
    es: '{model} ha respondido en {seconds} s (con {via}).',
  },

  // widget
  widgetNoKey: {
    en: 'No OpenRouter API key yet: add it in the configuration of the integration, then choose OpenRouter in Settings, Artificial Intelligence.',
    fr: 'Pas encore de clé d’API OpenRouter : ajoutez-la dans la configuration de l’intégration, puis choisissez OpenRouter dans Paramètres, Intelligence artificielle.',
    de: 'Noch kein OpenRouter-API-Schlüssel: Füge ihn in der Konfiguration der Integration hinzu und wähle dann OpenRouter unter Einstellungen, Künstliche Intelligenz.',
    es: 'Todavía no hay clave de API de OpenRouter: añádala en la configuración de la integración y luego elija OpenRouter en Ajustes, Inteligencia artificial.',
  },
  tileRequestsToday: {
    en: 'Requests today',
    fr: 'Appels du jour',
    de: 'Anfragen heute',
    es: 'Solicitudes hoy',
  },
  tileCostToday: {
    en: 'Cost today',
    fr: 'Coût du jour',
    de: 'Kosten heute',
    es: 'Coste hoy',
  },
  tileCostMonth: {
    en: 'Cost this month',
    fr: 'Coût du mois',
    de: 'Monatskosten',
    es: 'Coste del mes',
  },
  tileErrorsToday: {
    en: 'Errors today',
    fr: 'Erreurs du jour',
    de: 'Fehler heute',
    es: 'Errores hoy',
  },
  tileKeyLeft: {
    en: 'Key credit left',
    fr: 'Crédit de la clé',
    de: 'Restguthaben',
    es: 'Saldo restante',
  },
  tileFreeLeft: {
    en: 'Free requests',
    fr: 'Appels gratuits',
    de: 'Gratis-Anfragen',
    es: 'Llamadas gratis',
  },
  chartCostTitle: {
    en: 'Cost per day',
    fr: 'Coût par jour',
    de: 'Kosten pro Tag',
    es: 'Coste por día',
  },
  chartCostSeries: { en: 'Cost', fr: 'Coût', de: 'Kosten', es: 'Coste' },
  chartTokensTitle: {
    en: 'Tokens per day',
    fr: 'Jetons par jour',
    de: 'Tokens pro Tag',
    es: 'Tokens por día',
  },
  chartTokensSeries: { en: 'Tokens', fr: 'Jetons', de: 'Tokens', es: 'Tokens' },
  rowState: { en: 'OpenRouter', fr: 'OpenRouter', de: 'OpenRouter', es: 'OpenRouter' },
  stateOk: { en: 'Answering', fr: 'Répond', de: 'Antwortet', es: 'Responde' },
  stateNoKey: {
    en: 'No API key',
    fr: 'Pas de clé d’API',
    de: 'Kein API-Schlüssel',
    es: 'Sin clave de API',
  },
  stateFailing: {
    en: 'Failing since {time}',
    fr: 'En erreur depuis {time}',
    de: 'Fehler seit {time}',
    es: 'Con errores desde {time}',
  },
  rowModels: { en: 'Models', fr: 'Modèles', de: 'Modelle', es: 'Modelos' },
  rowLastRequest: {
    en: 'Last request',
    fr: 'Dernière requête',
    de: 'Letzte Anfrage',
    es: 'Última solicitud',
  },
  valueLastRequest: {
    en: '{use}, {ago}',
    fr: '{use}, {ago}',
    de: '{use}, {ago}',
    es: '{use}, {ago}',
  },
  valueLastRequestTime: {
    en: '{use}, {ago} ({seconds} s)',
    fr: '{use}, {ago} ({seconds} s)',
    de: '{use}, {ago} ({seconds} s)',
    es: '{use}, {ago} ({seconds} s)',
  },
  rowLastError: {
    en: 'Last error',
    fr: 'Dernière erreur',
    de: 'Letzter Fehler',
    es: 'Último error',
  },
  buttonActivity: {
    en: 'OpenRouter activity',
    fr: 'Activité OpenRouter',
    de: 'OpenRouter-Aktivität',
    es: 'Actividad OpenRouter',
  },
  use_chat: { en: 'chat', fr: 'discussion', de: 'Chat', es: 'chat' },
  use_router: { en: 'router', fr: 'routeur', de: 'Router', es: 'enrutador' },
  use_digest: {
    en: 'weekly digest',
    fr: 'résumé hebdo',
    de: 'Wochenrückblick',
    es: 'resumen semanal',
  },
  use_web: { en: 'web search', fr: 'recherche web', de: 'Websuche', es: 'búsqueda web' },
  kind_auth: {
    en: 'key refused',
    fr: 'clé refusée',
    de: 'Schlüssel abgelehnt',
    es: 'clave rechazada',
  },
  kind_credits: {
    en: 'no credits',
    fr: 'plus de crédits',
    de: 'keine Credits',
    es: 'sin créditos',
  },
  kind_model: {
    en: 'model unavailable',
    fr: 'modèle indisponible',
    de: 'Modell nicht verfügbar',
    es: 'modelo no disponible',
  },
  kind_rate_limit: {
    en: 'rate limit',
    fr: 'limite de requêtes',
    de: 'Anfragelimit',
    es: 'límite de solicitudes',
  },
  kind_request: {
    en: 'request refused',
    fr: 'requête refusée',
    de: 'Anfrage abgelehnt',
    es: 'solicitud rechazada',
  },
  kind_server: {
    en: 'provider error',
    fr: 'erreur du fournisseur',
    de: 'Anbieterfehler',
    es: 'error del proveedor',
  },
  kind_unreachable: {
    en: 'unreachable',
    fr: 'injoignable',
    de: 'nicht erreichbar',
    es: 'inaccesible',
  },
  kind_timeout: { en: 'too slow', fr: 'trop lent', de: 'zu langsam', es: 'demasiado lento' },

  // durations
  never: { en: 'Never', fr: 'Jamais', de: 'Nie', es: 'Nunca' },
  justNow: { en: 'just now', fr: 'à l’instant', de: 'gerade eben', es: 'ahora mismo' },
  minutesAgo: {
    en: '{n} min ago',
    fr: 'il y a {n} min',
    de: 'vor {n} Min.',
    es: 'hace {n} min',
  },
  hoursAgo: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },
  daysAgo: {
    en: '{n} days ago',
    fr: 'il y a {n} jours',
    de: 'vor {n} Tagen',
    es: 'hace {n} días',
  },
};

/**
 * @description Whether a value is a language of the integration.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language, with its values.
 * @param {string} key - A TEXTS key.
 * @param {string} language - The language (English when unknown).
 * @param {object} [values] - The values of the `{placeholders}`.
 * @returns {string} The text, the key itself when unknown.
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[isLanguage(language) ? language : 'en'] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

/**
 * @description A text in the four languages.
 * @param {string|Function} key - A TEXTS key, or `(language) => text`.
 * @param {object|Function} [values] - The values, or `(language) => values`.
 * @returns {object} `{ en, fr, de, es }`.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      typeof key === 'function'
        ? key(language)
        : t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

/**
 * @description How long ago an instant was: "just now", "12 min ago", "3 h ago".
 * @param {number} at - The instant, in ms (0: never).
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function ago(at, now, language) {
  if (!at) {
    return t('never', language);
  }
  const minutes = Math.floor((now - at) / 60000);
  if (minutes < 1) {
    return t('justNow', language);
  }
  if (minutes < 60) {
    return t('minutesAgo', language, { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return t('hoursAgo', language, { n: hours });
  }
  return t('daysAgo', language, { n: Math.floor(hours / 24) });
}

/**
 * @description A number in the format of a language.
 * @param {number} value - The number.
 * @param {string} language - The language.
 * @param {number} [decimals] - The decimals at most.
 * @returns {string} "12,5" in French.
 */
function formatNumber(value, language, decimals = 1) {
  if (!Number.isFinite(value)) {
    return '–';
  }
  return new Intl.NumberFormat(isLanguage(language) ? language : 'en', {
    maximumFractionDigits: decimals,
  }).format(value);
}

export { LANGUAGES, TEXTS, isLanguage, t, all, ago, formatNumber };
