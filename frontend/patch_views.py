import re

with open('/Users/pranj/Documents/Personal/Projectsss/QuantGol/backend/api/views.py', 'r') as f:
    text = f.read()

# Fix the import
text = text.replace(
    'from services.ai_analyst import generate_tactical_insight',
    'from services.ai_analyst import TacticalAnalyst'
)

# Overwrite AnalyzeTacticsView
new_view = """class AnalyzeTacticsView(APIView):
    def post(self, request):
        try:
            recent_events = request.data.get('recentEvents', [])
            query = request.data.get('query', None)
            
            if not recent_events and not query:
                return Response(
                    {"error": "No data provided for analysis."}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

            analyst = TacticalAnalyst()
            analysis = analyst.generate_insight(recent_events, query=query)
            
            return Response({"analysis": analysis}, status=status.HTTP_200_OK)
            
        eximport re

with open('/Users/  
with op Re    text = f.read()

# Fix the import
text = text.replace(
    'from services.ai_analyst importVE
# Fix the import
  )text = text.rep.s    'from services.ac    'from services.ai_analyst import TacticalAnalyst'
)

# OverER)

# Overwrite AnalyzeTacticsView
new_view = """clasL)

wnew_view = """class An/Document    def post(self, request):
        try:
     s.        try:
            re(text)
