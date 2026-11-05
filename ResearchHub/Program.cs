
using ResearchHub.Services;

namespace ResearchHub
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            builder.Services.AddControllers();

            builder.Services.AddHttpClient<IAiService, AiService>(client =>
            {
                client.Timeout = TimeSpan.FromSeconds(30);
            });

            builder.Services.AddEndpointsApiExplorer();
            builder.Services.AddSwaggerGen();

            builder.Services.AddHttpClient<OpenAlexService>();

            var app = builder.Build();

            app.UseExceptionHandler(errorApp =>
            {
                errorApp.Run(async context =>
                {
                    var exceptionFeature =
                        context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>();

                    var logger = context.RequestServices
                        .GetRequiredService<ILogger<Program>>();

                    if (exceptionFeature?.Error != null)
                    {
                        logger.LogError(
                            exceptionFeature.Error,
                            "Unhandled exception occurred. Path: {Path}",
                            context.Request.Path);
                    }

                    context.Response.StatusCode = 500;
                    context.Response.ContentType = "text/plain";

                    await context.Response.WriteAsync(
                        "An unexpected server error occurred.");
                });
            });

            app.UseSwagger();
            app.UseSwaggerUI();

            app.UseHttpsRedirection();

            app.UseAuthorization();

            app.MapControllers();

            app.Run();
        }
    }
}
