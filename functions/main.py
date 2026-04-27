import firebase_admin
from firebase_admin import firestore
from firebase_functions import scheduler_fn

# Inicializar Firebase Admin SDK (una sola vez por instancia de la función)
firebase_admin.initialize_app()


@scheduler_fn.on_schedule(schedule="every 60 seconds")
def polling_cotizaciones(event: scheduler_fn.ScheduledEvent) -> None:
    """
    Consulta la API de PPI cada 60 segundos y escribe las cotizaciones
    actualizadas en Firestore (/market/cotizaciones).

    Implementación completa en Fase 2.
    Estructura que escribirá en Firestore:
    {
        "dolar_mep": float,
        "dolar_ccl": float,
        "dolar_bna": float,
        "dolar_oficial": float,
        "riesgo_pais_pb": int,
        "ultima_actualizacion": str (ISO 8601)
    }
    """
    # TODO Fase 2: descomentar cuando la integración PPI esté lista
    # from services.ppi_client import fetch_cotizaciones
    # db = firestore.client()
    # data = fetch_cotizaciones()
    # db.collection("market").document("cotizaciones").set(data)

    print("polling_cotizaciones: pendiente Fase 2")
