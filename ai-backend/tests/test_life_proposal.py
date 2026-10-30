import json, asyncio
from types import SimpleNamespace
import pytest
from api.life_proposal_routes import LifeLLMService,LifeRequest
class Responses:
    def __init__(self,complete=True):self.complete=complete
    async def create(self,**kwargs):
        assert kwargs['stream'] is True
        assert kwargs['text']['format']['strict'] is True
        assert 'operations' in kwargs['text']['format']['schema']['properties']
        async def events():
            yield SimpleNamespace(type='response.output_text.delta',delta=json.dumps({'summary':'test','intent':'answer','message':'已理解','operations':[],'warnings':[],'understanding':'已理解','questions':[],'adjustments':[]}))
            if self.complete:yield SimpleNamespace(type='response.completed')
        return events()
def test_structured_stream_validated_only_after_complete():
    service=object.__new__(LifeLLMService);service.model='test';service.provider='mock';service.client=SimpleNamespace(responses=Responses())
    result=asyncio.run(service.propose(LifeRequest(text='明天安排任务',context={})))
    assert result['proposal']['intent']=='answer'
    assert result['timings']['first_token_ms']>=0
def test_interrupted_stream_rejected():
    service=object.__new__(LifeLLMService);service.model='test';service.provider='mock';service.client=SimpleNamespace(responses=Responses(False))
    with pytest.raises(ValueError,match='Interrupted'):
        asyncio.run(service.propose(LifeRequest(text='安排任务',context={})))
