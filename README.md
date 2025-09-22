# Seoul Bike Sharing Demand — End-to-End Project

This repository contains a complete, step-by-step analysis and prediction pipeline for Seoul bike sharing demand, now enhanced with a voice AI assistant prototype.

## Project Overview
- **Dataset:** Hourly bike rental data in Seoul (2017–2018)
- **Goal:** Analyze trends and predict bike demand using machine learning
- **Technologies:** Python, Pandas, Matplotlib, Seaborn, Scikit-learn, XGBoost, SHAP
- **Additional Feature:** AI Voice Sales & Insights Agent prototype

## Folder Structure
- `data/` — Raw dataset
- `notebooks/` — Jupyter Notebook with full analysis
- `outputs/` — Feature-engineered dataset and ML predictions
- `seoul_bike_sales_agent_single.ipynb` — Single-agent voice AI prototype
- `context/` — Project context files for AI agent (JSON/insights)

## Steps in the Notebook
1. Setup & Data Loading
2. Data Inspection, Cleaning & Feature Engineering
3. Exploratory Data Analysis (EDA)
4. Dataset Preparation & Export
5. Dataset Preparation & Feature Encoding
6. Baseline Model: Linear Regression
7. XGBoost Model Training & Evaluation
8. Sample Predictions
9. SHAP Analysis for Model Interpretation
10. Temporal & Trend Analysis
11. Export Machine Learning Predictions & Feature-Engineered Dataset

## How to Run
1. Clone the repository
2. Install required packages:
   ```bash
   pip install -r requirements.txt


## 2. AI Voice Sales Agent (Demo)
**File:** `seoul_bike_sales_agent.ipynb`  
- Single-agent voice assistant powered by **Cerebras LLM**  
- Real-time **Cartesia STT/TTS** for conversational interaction  
- Uses **Demo data, which is approximately correct Seoul bike rentals, but precise  ** to answer questions about bike rentals and pricing  
- **Planned upgrade:** multi-agent system for technical support, pricing, and ridership forecasting (not implemented yet)

- **Important:** Before running the AI Sales Agent notebook, make sure to replace the placeholder API keys with your actual credentials:

```python
os.environ["CARTESIA_API_KEY"] = "YOUR_CARTESIA_API_KEY"
os.environ["CEREBRAS_API_KEY"] = "YOUR_CEREBRAS_API_KEY"
