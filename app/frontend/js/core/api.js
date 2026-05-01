// js/core/api.js - API клиент
export const API_BASE = "http://127.0.0.1:8000/api";

export class APIClient {
    static async call(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;
        console.log('API Call:', url, options);
        
        try {
            const response = await fetch(url, {
                headers: { "Content-Type": "application/json" },
                ...options
            });
            
            if (!response.ok) {
                const error = await response.text();
                console.error('API Error:', response.status, error);
                throw new Error(`API error: ${response.status} - ${error}`);
            }
            
            const data = await response.json();
            console.log('API Response:', data);
            return data;
        } catch (error) {
            console.error('API Call failed:', error);
            throw error;
        }
    }
    
    static async uploadFile(endpoint, formData) {
        const url = `${API_BASE}${endpoint}`;
        console.log('Upload to:', url);
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const error = await response.text();
                console.error('Upload Error:', response.status, error);
                throw new Error(`Upload error: ${response.status} - ${error}`);
            }
            
            const data = await response.json();
            console.log('Upload Response:', data);
            return data;
        } catch (error) {
            console.error('Upload failed:', error);
            throw error;
        }
    }
}
