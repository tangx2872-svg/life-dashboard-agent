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


class RecordingResponses:
    def __init__(self):self.captured={}
    async def create(self,**kwargs):
        self.captured.update(kwargs)
        async def events():
            yield SimpleNamespace(type='response.output_text.delta',delta=json.dumps({'summary':'test','intent':'plan','message':'安排好了','operations':[{'action':'create_task','targetId':None,'projectId':None,'clientRef':None,'title':'修改论文摘要','date':'2026-11-02','minutes':45,'priority':None,'description':None,'status':None}],'warnings':[],'understanding':'明天下午改摘要','questions':[],'adjustments':[]}))
            yield SimpleNamespace(type='response.completed')
        return events()

def test_force_plan_adds_strict_constraint():
    service=object.__new__(LifeLLMService);service.model='test';service.provider='mock'
    recorder=RecordingResponses();service.client=SimpleNamespace(responses=recorder)
    result=asyncio.run(service.propose(LifeRequest(text='明天下午三点修改论文摘要，45分钟',context={},forcePlan=True)))
    assert result['proposal']['intent']=='plan'
    assert '不得追问' in recorder.captured['instructions']
    assert 'forcePlan' not in json.loads(recorder.captured['input'])

def test_default_request_has_no_forced_plan_text():
    service=object.__new__(LifeLLMService);service.model='test';service.provider='mock'
    recorder=RecordingResponses();service.client=SimpleNamespace(responses=recorder)
    asyncio.run(service.propose(LifeRequest(text='明天下午三点修改论文摘要',context={})))
    assert '不得追问' not in recorder.captured['instructions']
