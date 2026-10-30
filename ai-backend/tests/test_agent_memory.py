import json
import api.agent_routes as routes
class Model:
    async def generate(self, prompt, max_output_tokens=None):
        assert 'password' in prompt or 'context' in prompt
        if 'Extract only' in prompt:
            return json.dumps({'shouldStore':True,'memories':[{'content':'偏好晚上学习','category':'habit','importance':0.8,'confidence':0.95,'action':'create','key':'study_time'}]})
        return '你通常晚上有空。'
def test_memory_schema_and_answer_context(client, monkeypatch):
    monkeypatch.setattr(routes, '_autodl_llm', lambda request:Model())
    result=client.post('/api/agent/memory',json={'text':'我通常晚上学习'})
    assert result.status_code==200
    assert result.json()['memories'][0]['category']=='habit'
    result=client.post('/api/agent/answer',json={'text':'什么时候学习？','context':{'relevantLongTermMemory':[{'content':'晚上学习'}]}})
    assert result.status_code==200
    assert '晚上' in result.json()['answer']
def test_memory_request_rejects_unknown_fields(client):
    result=client.post('/api/agent/memory',json={'text':'我喜欢晚上学习','userId':'foreign'})
    assert result.status_code==422
