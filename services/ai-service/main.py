import os
import json
import asyncio
from fastapi import FastAPI, BackgroundTasks
from prophet import Prophet
import pandas as pd
from redis import Redis
from dotenv import load_dotenv

load_dotenv(dotenv_path='../../.env')

app = FastAPI()
redis_conn = Redis(
    host=os.getenv('REDIS_HOST', 'redis'),
    port=int(os.getenv('REDIS_PORT', 6379)),
    decode_responses=True
)

# Mock model (Prophet)
def generate_mock_forecast(crop_type: str):
    # Mock some data for Prophet
    df = pd.DataFrame({
        'ds': pd.date_range(start='2025-01-01', periods=100, freq='D'),
        'y': [100 + i * 0.1 for i in range(100)] # Simple trend
    })
    m = Prophet(daily_seasonality=True)
    m.fit(df)
    future = m.make_future_dataframe(periods=30)
    forecast = m.predict(future)
    return forecast.iloc[-1]['yhat']

@app.get("/health")
def health():
    return {"status": "ok", "service": "ai-service"}

@app.get("/recommend")
def recommend(crop_type: str, quantity: float, location: str):
    # Real logic would join listing data with weather and price history
    suggested_price = generate_mock_forecast(crop_type)
    return {
        "crop_type": crop_type,
        "suggested_price": float(suggested_price),
        "confidence_score": 0.85
    }

async def process_listing_created():
    group = 'ai-group'
    consumer = 'ai-consumer-1'
    stream = 'listing.created'

    try:
        redis_conn.xgroup_create(stream, group, id='0', mkstream=True)
    except Exception:
        pass

    while True:
        try:
            results = redis_conn.xreadgroup(group, consumer, {stream: '>'}, count=1, block=5000)
            if results:
                for stream_name, messages in results:
                    for msg_id, data in messages:
                        listing_data = json.loads(data['data'])
                        print(f"AI Service: Processing listing {listing_data['id']}")
                        
                        # Generate suggestion
                        suggested_price = generate_mock_forecast(listing_data['crop_type'])
                        
                        # Publish back to event bus
                        suggestion = {
                            "listing_id": listing_data['id'],
                            "suggested_price": float(suggested_price),
                            "timestamp": pd.Timestamp.now().isoformat()
                        }
                        redis_conn.xadd('ai.price.suggested', {'data': json.dumps(suggestion)})
                        
                        redis_conn.xack(stream, group, msg_id)
        except Exception as e:
            print(f"Error in AI consumer: {e}")
        await asyncio.sleep(1)

@app.on_event("startup")
async def startup_event():
    # Run consumer as a background task
    asyncio.create_task(process_listing_created())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
